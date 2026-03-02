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
import re

GROQ_API_KEY ="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"
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

# This must be at the same level as enrich_item, not inside it!
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
        "temperature": 0.1,
        "max_tokens": 1024,
        "response_format": {"type": "json_object"} 
    }
    try:
        res = requests.post(GROQ_URL, headers=headers, json=body, timeout=30)
        res.raise_for_status()
        return res.json()["choices"][0]["message"]["content"]
    except Exception as e:
        print(f"Groq API Error: {str(e)}") 
        raise HTTPException(status_code=503, detail=f"Groq error: {str(e)}")


