from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware # Important for Frontend
from pydantic import BaseModel
from datetime import datetime, timedelta
from typing import List

app = FastAPI()

# --- ADDED FOR FRONTEND CONNECTION ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, change this to your frontend URL
    allow_methods=["*"],
    allow_headers=["*"],
)

class SaleRequest(BaseModel):
    item_id: int
    quantity: int

inventory = [
    {"id": 1, "name": "Amoxicillin", "stock": 15, "expiry": "2026-06-15", "provider": "PharmaDist"},
    {"id": 2, "name": "Ibuprofen", "stock": 200, "expiry": "2027-10-01", "provider": "MedCorp"}
]

@app.get("/inventory")
def get_inventory():
    today = datetime.now()
    five_months_out = today + timedelta(days=150)
    
    for item in inventory:
        expiry_date = datetime.strptime(item["expiry"], "%Y-%m-%d")
        item["is_expiring_soon"] = expiry_date <= five_months_out
        item["needs_restock"] = item["stock"] < 20
        
    return inventory

@app.post("/sell")
def process_sale(sale: SaleRequest):
    for item in inventory:
        if item["id"] == sale.item_id:
            item["stock"] -= sale.quantity
            return {"status": "success", "new_stock": item["stock"]}
    return {"status": "error", "message": "Item not found"}