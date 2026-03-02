from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime
from sqlalchemy import create_engine, Column, Integer, String, Float
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from collections import defaultdict
import requests
import json
import os

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "YOUR_GROQ_API_KEY_HERE")
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "llama3-8b-8192"  # free and fast
SUPPLIER_WHATSAPP = "50212345678"  # replace with real number

SQLALCHEMY_DATABASE_URL = "sqlite:///./pharmacy.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class Medicine(Base):
    __tablename__ = "inventory"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    stock = Column(Integer)
    expiry = Column(String)
    provider = Column(String)
    min_stock = Column(Integer, default=20)
    unit_price = Column(Float, default=10.0)


class Sale(Base):
    __tablename__ = "sales"
    id = Column(Integer, primary_key=True, index=True)
    medicine_id = Column(Integer)
    medicine_name = Column(String)
    quantity = Column(Integer)
    date = Column(String)


Base.metadata.create_all(bind=engine)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class SaleRequest(BaseModel):
    item_id: int
    quantity: int


class MedicineCreate(BaseModel):
    name: str
    stock: int
    expiry: str
    provider: str
    min_stock: int = 20
    unit_price: float = 10.0


class ChatRequest(BaseModel):
    message: str


def seed_db(db):
    db.add_all([
        Medicine(name="Amoxicillin", stock=15, expiry="2026-06-15", provider="PharmaDist", min_stock=30, unit_price=12.5),
        Medicine(name="Ibuprofen", stock=200, expiry="2027-10-01", provider="MedCorp", min_stock=50, unit_price=5.0),
        Medicine(name="Paracetamol", stock=8, expiry="2025-12-01", provider="PharmaDist", min_stock=50, unit_price=3.5),
        Medicine(name="Metformin", stock=45, expiry="2026-03-20", provider="GlobalMeds", min_stock=40, unit_price=8.0),
        Medicine(name="Atorvastatin", stock=5, expiry="2026-08-10", provider="MedCorp", min_stock=25, unit_price=15.0),
    ])
    db.commit()


def enrich_item(item):
    today = datetime.today()
    try:
        exp_date = datetime.strptime(item.expiry, "%Y-%m-%d")
        days_to_expiry = (exp_date - today).days
        is_expiring_soon = 0 < days_to_expiry <= 90
        is_expired = exp_date < today
    except Exception:
        days_to_expiry = 999
        is_expiring_soon = False
        is_expired = False

    return {
        "id": item.id,
        "name": item.name,
        "stock": item.stock,
        "expiry": item.expiry,
        "provider": item.provider,
        "min_stock": item.min_stock,
        "unit_price": item.unit_price,
        "is_expiring_soon": is_expiring_soon,
        "is_expired": is_expired,
        "days_to_expiry": days_to_expiry,
        "needs_restock": item.stock < item.min_stock,
    }


def ask_groq(system_prompt: str, user_prompt: str) -> str:
    headers = {
        "Authorization": f"Bearer {GROQ_API_KEY}",
        "Content-Type": "application/json"
    }
    body = {
        "model": GROQ_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": 0.3,
        "max_tokens": 1024
    }
    try:
        res = requests.post(GROQ_URL, headers=headers, json=body, timeout=30)
        res.raise_for_status()
        return res.json()["choices"][0]["message"]["content"]
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Groq error: {str(e)}")


def parse_json(text: str) -> dict:
    text = text.replace("```json", "").replace("```", "").strip()
    start = text.find("{")
    end = text.rfind("}") + 1
    return json.loads(text[start:end])


@app.get("/inventory")
def get_inventory(db: Session = Depends(get_db)):
    items = db.query(Medicine).all()
    if not items:
        seed_db(db)
        items = db.query(Medicine).all()
    return [enrich_item(i) for i in items]


@app.post("/inventory")
def add_medicine(med: MedicineCreate, db: Session = Depends(get_db)):
    item = Medicine(**med.dict())
    db.add(item)
    db.commit()
    db.refresh(item)
    return enrich_item(item)


@app.put("/inventory/{item_id}")
def update_medicine(item_id: int, med: MedicineCreate, db: Session = Depends(get_db)):
    item = db.query(Medicine).filter(Medicine.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    for k, v in med.dict().items():
        setattr(item, k, v)
    db.commit()
    return enrich_item(item)


@app.delete("/inventory/{item_id}")
def delete_medicine(item_id: int, db: Session = Depends(get_db)):
    item = db.query(Medicine).filter(Medicine.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(item)
    db.commit()
    return {"status": "deleted"}


@app.post("/sell")
def process_sale(sale: SaleRequest, db: Session = Depends(get_db)):
    item = db.query(Medicine).filter(Medicine.id == sale.item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Medicine not found")
    if item.stock < sale.quantity:
        raise HTTPException(status_code=400, detail="Insufficient stock")
    item.stock -= sale.quantity
    db.add(Sale(
        medicine_id=item.id,
        medicine_name=item.name,
        quantity=sale.quantity,
        date=datetime.today().strftime("%Y-%m-%d")
    ))
    db.commit()
    return {"status": "success", "remaining_stock": item.stock}


@app.get("/sales")
def get_sales(db: Session = Depends(get_db)):
    return db.query(Sale).all()


@app.get("/ai/alerts")
def get_alerts(db: Session = Depends(get_db)):
    items = db.query(Medicine).all()
    enriched = [enrich_item(i) for i in items]
    critical = [i for i in enriched if i["needs_restock"] or i["is_expiring_soon"] or i["is_expired"]]

    if not critical:
        return {"alerts": [], "whatsapp_messages": [], "supplier_whatsapp": SUPPLIER_WHATSAPP}

    system = "You are a pharmacy inventory AI. Respond ONLY with valid JSON, no extra text."
    user = f"""Analyze these pharmacy inventory issues and generate alerts and WhatsApp supplier messages.

Issues:
{json.dumps(critical, indent=2)}

Respond with exactly this JSON structure:
{{
  "alerts": [
    {{"id": 1, "name": "medicine name", "message": "clear alert description", "priority": "critical or warning or info"}}
  ],
  "whatsapp_messages": [
    {{"provider": "supplier name", "message": "professional restock request message", "medicines": ["medicine1"]}}
  ]
}}"""

    text = ask_groq(system, user)
    result = parse_json(text)
    result["supplier_whatsapp"] = SUPPLIER_WHATSAPP
    return result


@app.post("/ai/chat")
def ai_chat(req: ChatRequest, db: Session = Depends(get_db)):
    items = db.query(Medicine).all()
    enriched = [enrich_item(i) for i in items]
    sales = db.query(Sale).all()

    system = f"""You are a helpful pharmacy assistant. You have access to live inventory and sales data.
Inventory: {json.dumps(enriched)}
Sales: {json.dumps([{{"name": s.medicine_name, "qty": s.quantity, "date": s.date}} for s in sales])}
Answer concisely and helpfully."""

    response = ask_groq(system, req.message)
    return {"response": response}


@app.get("/ai/predictions")
def get_predictions(db: Session = Depends(get_db)):
    items = db.query(Medicine).all()
    sales = db.query(Sale).all()
    enriched = [enrich_item(i) for i in items]

    system = "You are a pharmacy AI analyst. Respond ONLY with valid JSON, no extra text."
    user = f"""Analyze inventory and sales data. Generate stock predictions.

Inventory: {json.dumps(enriched)}
Sales: {json.dumps([{{"name": s.medicine_name, "qty": s.quantity, "date": s.date}} for s in sales])}

Respond with exactly:
{{
  "predictions": [
    {{"name": "medicine", "current_stock": 0, "predicted_days_until_empty": 30, "recommended_order_qty": 50, "trend": "increasing or stable or decreasing"}}
  ],
  "summary": "brief overall summary"
}}"""

    text = ask_groq(system, user)
    return parse_json(text)