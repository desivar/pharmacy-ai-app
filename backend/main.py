from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from datetime import datetime, timedelta
from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session

SQLALCHEMY_DATABASE_URL = "sqlite:///./pharmacy.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, 
                       connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class Medicine(Base):
    __tablename__ = "inventory"  
    id = Column(Integer, primary_key=True, index=True) 
    name = Column(String)
    stock = Column(Integer)
    expiry = Column(String)
    provider = Column(String)

    Base.metadata.create_all(bind=engine)

app = FastAPI()

 app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # Fixed: was [""] — should be ["*"] to allow all origins
    allow_methods=["*"],   # Fixed: same issue
    allow_headers=["*"],
)

def get_db():
    db = SessionLocal()  # Fixed: indentation
    try:
        yield db
    finally:
        db.close()  # Fixed: indentation

class SaleRequest(BaseModel):
    item_id: int   # Fixed: indentation throughout
    quantity: int

@app.get("/inventory")
def get_inventory(db: Session = Depends(get_db)):
    items = db.query(Medicine).all()  # Fixed: indentation throughout
    if not items:
        db.add_all([
            Medicine(name="Amoxicillin", stock=15, expiry="2026-06-15", provider="PharmaDist"),
            Medicine(name="Ibuprofen", stock=200, expiry="2027-10-01", provider="MedCorp")
        ])
        db.commit()
        items = db.query(Medicine).all()
    return items

@app.post("/sell")
def process_sale(sale: SaleRequest, db: Session = Depends(get_db)):
    item = db.query(Medicine).filter(Medicine.id == sale.item_id).first() #Fixed: indentation throughout
    if item:
        item.stock -= sale.quantity
        db.commit()
        return {"status": "success"}
    return {"status": "error"}