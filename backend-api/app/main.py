import logging
from contextlib import asynccontextmanager
from typing import List, Optional
from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.database import get_db, init_db, engine, DB_HOST, DB_NAME
from app.models import Product

logger = logging.getLogger("retail-api")

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: execute automatic table creation and data seeding
    logger.info("Starting Cloud Retail Backend Service...")
    init_db()
    yield
    logger.info("Shutting down Cloud Retail Backend Service...")

app = FastAPI(
    title="Cloud Retail Backend Microservice",
    description="Backend catalog service for the Amazon EKS Capstone Project",
    version="1.0.0",
    lifespan=lifespan,
)

# Enable CORS for local dev / decoupled setups
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ProductResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    price: float
    stock: int

    class Config:
        from_attributes = True

@app.get("/", tags=["Root"])
def read_root():
    return {
        "service": "Cloud Retail Backend Microservice",
        "version": "1.0.0",
        "status": "online",
        "endpoints": {
            "health": "/api/health",
            "products": "/api/products",
            "docs": "/docs",
        },
    }

@app.get("/api/health", tags=["Health"])
def health_check(db: Session = Depends(get_db)):
    """Health probe endpoint checking microservice and database status."""
    try:
        db.execute(text("SELECT 1"))
        return {
            "status": "healthy",
            "database": "connected",
            "database_host": DB_HOST,
            "database_name": DB_NAME,
        }
    except Exception as exc:
        logger.error(f"Health check database query failed: {exc}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "status": "unhealthy",
                "database": "disconnected",
                "error": str(exc),
            },
        )

@app.get("/api/products", response_model=List[ProductResponse], tags=["Catalog"])
def get_products(db: Session = Depends(get_db)):
    """Retrieve all catalog items from the database."""
    try:
        products = db.query(Product).order_by(Product.id.asc()).all()
        return [p.to_dict() for p in products]
    except Exception as exc:
        logger.error(f"Error querying products: {exc}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to query product catalog: {str(exc)}",
        )
