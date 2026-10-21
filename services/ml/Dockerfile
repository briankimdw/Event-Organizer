# CPU image for deploying the ML service (Hugging Face Spaces, Fly.io, Railway, Render, Cloud Run...).
# Hugging Face Spaces: scripts/deploy_hf_space.py uploads this folder; see docs/DEPLOY.md.
FROM python:3.12-slim
# Spaces run the container as uid 1000; the model caches must be readable (and writable) by it.
RUN useradd -m -u 1000 user
ENV HF_HOME=/srv/.cache/huggingface \
    PYTHONUNBUFFERED=1 \
    PORT=8000
WORKDIR /srv
RUN pip install --no-cache-dir torch==2.14.1 --index-url https://download.pytorch.org/whl/cpu
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# Bake the model weights into the image so containers start fast.
RUN python -c "from transformers import AutoModel, AutoProcessor; m='google/siglip-base-patch16-224'; AutoModel.from_pretrained(m); AutoProcessor.from_pretrained(m)"
COPY app ./app
# AI photo tools: download the models (~440 MB, checksums verified). Build with
# --build-arg FETCH_AI_MODELS=0 to leave them out (the /ai/* tools then report unavailable).
ARG FETCH_AI_MODELS=1
COPY scripts ./scripts
RUN if [ "$FETCH_AI_MODELS" = "1" ]; then python scripts/fetch_models.py; fi
RUN chown -R user:user /srv
USER user
# API by default (PORT: 8000, or what the host sets); run the worker instead with: python -m app.worker
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
