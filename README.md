my-app/
├── backend/
│   ├── pyproject.toml        # or requirements.txt
│   ├── app/
│   │   ├── main.py           # FastAPI entrypoint
│   │   ├── events.py         # EventBus
│   │   └── services/
│   │       ├── email.py
│   │       ├── calendar.py
│   │       ├── analytics.py
│   │       └── payout.py
│   └── tests/
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   └── src/
├── docker-compose.yml        # optional
├── Makefile                  # optional shortcuts
└── README.md


# terminal 1: backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e .
uvicorn app.main:app --reload --port 8000

# terminal 2: frontend
cd frontend
npm install
npm run dev          # Vite on :5173
