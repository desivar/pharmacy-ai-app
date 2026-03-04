import os
import json
import re
import requests
from datetime import datetime, timedelta
from typing import Optional

from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String, Float
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from dotenv import load_dotenv
from passlib.context import CryptContext
from jose import JWTError, jwt

load_dotenv()

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "YOUR_GROQ_API_KEY_HERE")
GROQ_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_MODEL = "llama-3.1-8b-instant"
SUPPLIER_WHATSAPP = "50212345678"

SECRET_KEY = os.getenv("SECRET_KEY", "pharmacy-secret-key-change-this-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 8  # 8 hours

SQLALCHEMY_DATABASE_URL = "sqlite:///./pharmacy.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="auth/login")


# ── MODELS ──────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    role = Column(String, default="staff")  # "admin" or "staff"


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


# ── PYDANTIC SCHEMAS ─────────────────────────────────────

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


class UserCreate(BaseModel):
    username: str
    password: str
    role: str = "staff"


class Token(BaseModel):
    access_token: str
    token_type: str
    role: str
    username: str


# ── HELPERS ──────────────────────────────────────────────

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_token(data: dict) -> str:
    to_encode = data.copy()
    to_encode["exp"] = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise credentials_exception
    return user


def require_admin(current_user: User = Depends(get_current_user)):
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


def seed_users(db: Session):
    if not db.query(User).first():
        db.add_all([
            User(username="admin", hashed_password=hash_password("admin123"), role="admin"),
            User(username="staff", hashed_password=hash_password("staff123"), role="staff"),
        ])
        db.commit()


def seed_inventory(db: Session):
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
        "id": item.id, "name": item.name, "stock": item.stock,
        "expiry": item.expiry, "provider": item.provider,
        "min_stock": item.min_stock, "unit_price": item.unit_price,
        "is_expiring_soon": is_expiring_soon, "is_expired": is_expired,
        "days_to_expiry": days_to_expiry, "needs_restock": item.stock < item.min_stock,
    }


def ask_groq(system_prompt: str, user_prompt: str) -> str:
    headers = {"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"}
    body = {
        "model": GROQ_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": 0.1, "max_tokens": 1024
    }
    try:
        res = requests.post(GROQ_URL, headers=headers, json=body, timeout=30)
        res.raise_for_status()
        return res.json()["choices"][0]["message"]["content"]
    except Exception as e:
        print(f"Groq error: {e}")
        return '{"error": "AI unavailable"}'


def parse_json(text: str) -> dict:
    try:
        match = re.search(r'\{.*\}', text, re.DOTALL)
        if match:
            return json.loads(match.group())
        return json.loads(text)
    except Exception:
        return {"alerts": [], "whatsapp_messages": [], "predictions": [], "summary": "Error parsing AI response"}


def tostr(val) -> str:
    if val is None:
        return "N/A"
    if isinstance(val, dict):
        return json.dumps(val)
    return str(val)


# ── APP SETUP ────────────────────────────────────────────

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def startup():
    db = SessionLocal()
    seed_users(db)
    if not db.query(Medicine).first():
        seed_inventory(db)
    db.close()


# ── AUTH ROUTES ──────────────────────────────────────────

@app.post("/auth/login", response_model=Token)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == form.username).first()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    token = create_token({"sub": user.username, "role": user.role})
    return {"access_token": token, "token_type": "bearer", "role": user.role, "username": user.username}


@app.get("/auth/me")
def get_me(current_user: User = Depends(get_current_user)):
    return {"username": current_user.username, "role": current_user.role}


@app.post("/auth/users")
def create_user(user: UserCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    if db.query(User).filter(User.username == user.username).first():
        raise HTTPException(status_code=400, detail="Username already exists")
    db.add(User(username=user.username, hashed_password=hash_password(user.password), role=user.role))
    db.commit()
    return {"status": "created", "username": user.username, "role": user.role}


@app.get("/auth/users")
def list_users(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    users = db.query(User).all()
    return [{"id": u.id, "username": u.username, "role": u.role} for u in users]


@app.delete("/auth/users/{user_id}")
def delete_user(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(require_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.username == current_user.username:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    db.delete(user)
    db.commit()
    return {"status": "deleted"}


# ── INVENTORY ROUTES ─────────────────────────────────────

@app.get("/inventory")
def get_inventory(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    items = db.query(Medicine).all()
    return [enrich_item(i) for i in items]


@app.post("/inventory")
def add_medicine(med: MedicineCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    item = Medicine(**med.dict())
    db.add(item)
    db.commit()
    db.refresh(item)
    return enrich_item(item)


@app.put("/inventory/{item_id}")
def update_medicine(item_id: int, med: MedicineCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    item = db.query(Medicine).filter(Medicine.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    for k, v in med.dict().items():
        setattr(item, k, v)
    db.commit()
    return enrich_item(item)


@app.delete("/inventory/{item_id}")
def delete_medicine(item_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    item = db.query(Medicine).filter(Medicine.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(item)
    db.commit()
    return {"status": "deleted"}


@app.post("/sell")
def process_sale(sale: SaleRequest, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    item = db.query(Medicine).filter(Medicine.id == sale.item_id).first()
    if not item or item.stock < sale.quantity:
        raise HTTPException(status_code=400, detail="Insufficient stock")
    item.stock -= sale.quantity
    db.add(Sale(medicine_id=item.id, medicine_name=item.name, quantity=sale.quantity, date=datetime.today().strftime("%Y-%m-%d")))
    db.commit()
    return {"status": "success", "remaining_stock": item.stock}


@app.get("/sales")
def get_sales(db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    return db.query(Sale).all()


# ── AI ROUTES (admin only) ───────────────────────────────

@app.get("/ai/alerts")
def get_alerts(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    items = db.query(Medicine).all()
    enriched = [enrich_item(i) for i in items]
    critical = [i for i in enriched if i["needs_restock"] or i["is_expiring_soon"] or i["is_expired"]]
    if not critical:
        return {"alerts": [], "whatsapp_messages": [], "supplier_whatsapp": SUPPLIER_WHATSAPP}
    system = "You are a pharmacy AI. Respond ONLY with a valid JSON object. No markdown."
    user = f"Analyze these issues and return JSON with 'alerts' and 'whatsapp_messages': {json.dumps(critical)}"
    result = parse_json(ask_groq(system, user))
    result["supplier_whatsapp"] = SUPPLIER_WHATSAPP
    return result


@app.post("/ai/chat")
def ai_chat(req: ChatRequest, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    items = db.query(Medicine).all()
    enriched = [enrich_item(i) for i in items]
    system = f"You are a pharmacy assistant. Inventory: {json.dumps(enriched[:5])}. Answer helpfully and concisely."
    response = ask_groq(system, req.message)
    try:
        parsed = parse_json(response)
        return {"response": tostr(parsed.get("response", response))}
    except Exception:
        return {"response": response}


@app.get("/ai/predictions")
def get_predictions(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    items = db.query(Medicine).all()
    enriched = [enrich_item(i) for i in items]
    system = "You are an analyst. Respond ONLY with a JSON object containing 'predictions' and 'summary'."
    user = f"Predict stock trends: {json.dumps(enriched)}"
    return parse_json(ask_groq(system, user))