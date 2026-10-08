"""SigLIP wrapper: images -> 768-number embeddings, plus auto-tags."""
from __future__ import annotations

import torch
from PIL import Image
from transformers import AutoModel, AutoProcessor

from . import config
from .tags import TAG_GROUPS, all_prompts, select_tags


class SigLIP:
    def __init__(self, model_id: str = config.MODEL_ID, device: str | None = config.DEVICE):
        self.model_id = model_id
        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.model = AutoModel.from_pretrained(model_id).to(self.device).eval()
        self.processor = AutoProcessor.from_pretrained(model_id)
        # Tag prompts never change, so embed them once.
        self._prompts = all_prompts()
        self._prompt_embeddings = self.embed_texts([p for _, _, p in self._prompts])

    @torch.no_grad()
    def embed_images(self, images: list[Image.Image]) -> torch.Tensor:
        """(N, 768) unit-length embeddings. Similar-looking photos get similar vectors."""
        inputs = self.processor(images=[im.convert("RGB") for im in images], return_tensors="pt").to(self.device)
        features = self.model.get_image_features(**inputs)
        return torch.nn.functional.normalize(features, dim=-1)

    @torch.no_grad()
    def embed_texts(self, texts: list[str]) -> torch.Tensor:
        """(N, 768) unit-length text embeddings, in the same space as images (enables text search)."""
        # SigLIP was trained with max-length padding; other padding hurts accuracy.
        inputs = self.processor(text=texts, padding="max_length", return_tensors="pt").to(self.device)
        features = self.model.get_text_features(**inputs)
        return torch.nn.functional.normalize(features, dim=-1)

    @torch.no_grad()
    def match_probabilities(self, image_embeddings: torch.Tensor, text_embeddings: torch.Tensor) -> torch.Tensor:
        """(images, texts) probabilities that each text describes each image (SigLIP's sigmoid head)."""
        logits = image_embeddings @ text_embeddings.T * self.model.logit_scale.exp() + self.model.logit_bias
        return torch.sigmoid(logits)

    @torch.no_grad()
    def tag_scores(self, image_embeddings: torch.Tensor) -> list[dict[str, dict[str, float]]]:
        """Per image: {group: {tag: probability within the group}} (each group sums to 1)."""
        logits = (image_embeddings @ self._prompt_embeddings.T * self.model.logit_scale.exp() + self.model.logit_bias).cpu()
        results = []
        for row in logits:
            groups = {}
            for group in TAG_GROUPS:
                idx = [k for k, (g, _, _) in enumerate(self._prompts) if g == group]
                probs = torch.softmax(row[idx], dim=0)
                groups[group] = {self._prompts[k][1]: float(p) for k, p in zip(idx, probs)}
            results.append(groups)
        return results

    def analyze(self, images: list[Image.Image]) -> list[tuple[list[float], list[str]]]:
        """For each image: (embedding as a list of floats, auto-tags)."""
        embeddings = self.embed_images(images)
        scores = self.tag_scores(embeddings)
        return [
            (emb.cpu().tolist(), select_tags(s, black_and_white=is_black_and_white(im)))
            for emb, s, im in zip(embeddings, scores, images)
        ]


def is_black_and_white(image: Image.Image, max_saturation: float = 0.06) -> bool:
    """True when the photo has (almost) no color: average saturation below ~6%."""
    small = image.convert("RGB").resize((64, 64))
    saturation = small.convert("HSV").getchannel("S")
    return sum(saturation.getdata()) / (64 * 64 * 255) < max_saturation


def to_pgvector(values: list[float]) -> str:
    """Format for Postgres pgvector input: '[0.123456,-0.5,...]'."""
    return "[" + ",".join(f"{v:.6f}" for v in values) + "]"
