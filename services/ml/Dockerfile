# CPU image for deploying the ML service (Fly.io, Railway, Render, Cloud Run...).
FROM python:3.12-slim
WORKDIR /srv
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu
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
# API by default; run the worker instead with: python -m app.worker
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
