from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime
from sqlalchemy import create_engine, Column, Integer, String, Float
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
import requests
import json
import re

# --- 1. CONFIGURATION ---
GROQ_API_KEY = "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"
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "llama3-8b-8192"
SUPPLIER_WHATSAPP = "50212345678"

# --- 2. DATABASE SETUP ---
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

# --- 3. FASTAPI SETUP ---
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 4. MODELS & HELPERS ---
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

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def seed_db(db: Session):
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
    headers = {"Authorization": f"Bearer {GROQ_API_KEY", "Content-Type": "application/json"}
    body = {
        "model": GROQ_MODEL
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": 0.1,
        "max_tokens": 1024
    }
    try:
        res = requests.post(GRO_URL, headers=headers, json=body, timeout=30)
        if res.status_code == 503:
            return json.dumps({"response": "AI is busy. Please try again in 10 seconds."})
        res.raise_for_status()
        return res.json()["choices"][0]["message"]["content"]
    except Exception as e:
        print(f"Groq API Error: {str(e)}")
        return json.dumps({"response": "Error connecting to AI."})

def parse_json(text: str) -> dict:
    try:
        match = re.search(r'\{.*\}', text, re.DOTALL)
        if match:
            return json.loads(match.group())
        return json.loads(text)
    except Exception:
        return {"alerts": [], "whatsapp_messages": [], "predictions": [], "summary": "Error parsing AI data"}

# --- 5. ROUTES ---
@app.get("/")
def home():
    return {"status": "Pharmacy API is running", "docs": "/docs"}

@app.get("/inventory")
def get_inventory(db: Session = Depends(get_db)):
    items = db.query(Medicine).all()
    if not items:
        seed_db(db)
        items = db.query(Medicine).all()
    return [enrich_item(i) for i in items]

@app.post("/sell")
def process_sale(sale: SaleRequest, db: Session = Depends(get_db)):
    item = db.query(Medicine).filter(Medicine.id == sale.item_id).first()
    if not item or item.stock < sale.quantity:
        raise HTTPException(status_code=400, detail="Insufficient stock")
    item.stock -= sale.quantity
    db.add(Sale(medicine_id=item.id, medicine_name=item.name, quantity=sale.quantity, date=datetime.today().strftime("%Y-%m-%d")))
    db.commit()
    return {"status": "success", "remaining_stock": item.stock}

@app.get("/ai/alerts")
def get_alerts(db: Session = Depends(get_db)):
    items = db.query(Medicine).all()
    enriched = [enrich_item(i) for i in items]
    critical = [i for i in enriched if i["needs_restock"] or i["is_expiring_soon"] or i["is_expired"]]

    if not critical:
        return {"alerts": [], "whatsapp_messages": [], "supplier_whatsapp": SUPPLIER_WHATSAPP}

    system = "You are a pharmacy AI. Respond ONLY with a valid JSON object. No extra text."
    user = f"Analyze these issues and return JSON with 'alerts' and 'whatsapp_messages': {json.dumps(critical)}"
    
    raw_text = ask_groq(system, user)
    result = parse_json(raw_text)
    result["supplier_whatsapp"] = SUPPLIER_WHATSAPP
    return result

@app.post("/ai/chat")
def ai_chat(req: ChatRequest, db: Session = Depends(get_db)):
    items = db.query(Medicine).all()
    enriched = [enrich_item(i) for i in items]
    
    system = "You are a pharmacy assistant. You MUST respond with a JSON object containing a 'response' key."
    user = f"Inventory: {json.dumps(enriched[:5])}\nQuestion: {req.message}"
    
    raw_text = ask_groq(system, user)
    parsed = parse_json(raw_text)
    return {"response": parsed.get("response", "I'm processing your request.")}

@app.get("/ai/predictions")
def get_predictions(db: Session = Depends(get_db)):
    items = db.query(Medicine).all()
    enriched = [enrich_item(i) for i in items]
    
    system = "You are an analyst. Respond ONLY with a JSON object containing 'predictions' and 'summary'."
    user = f"Predict stock based on this inventory: {json.dumps(enriched)}"
    
    raw_text = ask_groq(system, user)
    return parse_json(raw_text)