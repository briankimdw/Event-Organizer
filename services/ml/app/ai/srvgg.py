"""SRVGGNetCompact, the small Real-ESRGAN network (realesr-general-x4v3).

Used only by scripts/fetch_models.py to turn the released PyTorch weights into ONNX; the service
itself runs the ONNX file with ONNX Runtime and never imports this module.

Architecture from Real-ESRGAN (realesrgan/archs/srvgg_arch.py),
Copyright (c) 2021, Xintao Wang, BSD 3-Clause License. See THIRD_PARTY_NOTICES.md.
"""
from __future__ import annotations

import torch
from torch import nn
from torch.nn import functional as F


class SRVGGNetCompact(nn.Module):
    """conv -> PReLU, num_conv x (conv -> PReLU), conv -> pixel shuffle, plus a nearest-neighbour
    upsampled copy of the input (the network learns the residual)."""

    def __init__(self, num_in_ch: int = 3, num_out_ch: int = 3, num_feat: int = 64,
                 num_conv: int = 32, upscale: int = 4):
        super().__init__()
        self.upscale = upscale
        body: list[nn.Module] = [nn.Conv2d(num_in_ch, num_feat, 3, 1, 1), nn.PReLU(num_parameters=num_feat)]
        for _ in range(num_conv):
            body += [nn.Conv2d(num_feat, num_feat, 3, 1, 1), nn.PReLU(num_parameters=num_feat)]
        body.append(nn.Conv2d(num_feat, num_out_ch * upscale * upscale, 3, 1, 1))
        self.body = nn.ModuleList(body)
        self.upsampler = nn.PixelShuffle(upscale)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        out = x
        for layer in self.body:
            out = layer(out)
        out = self.upsampler(out)
        return out + F.interpolate(x, scale_factor=self.upscale, mode="nearest")
