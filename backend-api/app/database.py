import os
import time
import logging
from urllib.parse import quote_plus
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from app.models import Base, Product

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("retail-database")

# Environment variables
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "5432") or "5432"
DB_USER = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "postgres")
DB_NAME = os.getenv("DB_NAME", "retail_db")
DATABASE_URL = os.getenv("DATABASE_URL")

def get_database_url() -> str:
    """Build or retrieve database connection URL."""
    if DATABASE_URL:
        return DATABASE_URL
    if DB_HOST in ("sqlite", ":memory:") or DB_HOST.startswith("sqlite"):
        return "sqlite:///./retail.db"
    
    # URL-encode credentials to safely handle special characters in RDS passwords
    encoded_user = quote_plus(DB_USER)
    encoded_password = quote_plus(DB_PASSWORD)
    return f"postgresql://{encoded_user}:{encoded_password}@{DB_HOST}:{DB_PORT}/{DB_NAME}"

db_url = get_database_url()
is_sqlite = db_url.startswith("sqlite")

# Engine options
engine_args = {
    "pool_pre_ping": True,
}
if is_sqlite:
    engine_args["connect_args"] = {"check_same_thread": False}
else:
    engine_args.update({
        "pool_size": 10,
        "max_overflow": 20,
        "pool_recycle": 1800,
    })

engine = create_engine(db_url, **engine_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def get_db():
    """FastAPI dependency for database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def wait_for_database(max_retries: int = 10, initial_delay: float = 2.0) -> bool:
    """Retry connecting to the database on startup with exponential backoff."""
    delay = initial_delay
    for attempt in range(1, max_retries + 1):
        try:
            logger.info(f"Connecting to database at {DB_HOST}:{DB_PORT} (attempt {attempt}/{max_retries})...")
            with engine.connect() as connection:
                connection.execute(text("SELECT 1"))
            logger.info("Successfully connected to the database.")
            return True
        except Exception as exc:
            logger.warning(f"Database connection attempt {attempt} failed: {exc}")
            if attempt == max_retries:
                logger.error("Max connection retries reached. Database might be down or unreachable.")
                return False
            time.sleep(delay)
            delay = min(delay * 1.5, 15.0)
    return False

def init_db():
    """
    Auto-migration and auto-seeding routine:
    1. Base.metadata.create_all(bind=engine) creates tables automatically.
    2. Checks if the 'products' table is empty.
    3. If empty, automatically inserts 3 dummy retail products.
    """
    logger.info("Starting database initialization and auto-seeding check...")
    connected = wait_for_database()
    if not connected:
        logger.warning("Proceeding with table creation attempt despite connection warnings...")

    try:
        Base.metadata.create_all(bind=engine)
        logger.info("Database schema verified / created successfully.")

        db = SessionLocal()
        try:
            product_count = db.query(Product).count()
            logger.info(f"Current product count in database: {product_count}")

            if product_count == 0:
                logger.info("Table 'products' is empty. Auto-seeding initial catalog items...")
                seed_products = [
                    Product(
                        name="Mechanical Keyboard",
                        description="Tenkeyless mechanical gaming keyboard with hot-swappable tactile switches and RGB backlighting",
                        price=129.99,
                        stock=45,
                    ),
                    Product(
                        name="Wireless Mouse",
                        description="Ergonomic 2.4GHz dual-mode wireless mouse with high-precision optical sensor and silent click",
                        price=49.99,
                        stock=120,
                    ),
                    Product(
                        name="USB-C Hub",
                        description="7-in-1 aluminum multiport adapter with 4K HDMI, 100W Power Delivery, and 3x USB 3.0 ports",
                        price=34.50,
                        stock=80,
                    ),
                ]
                db.add_all(seed_products)
                db.commit()
                logger.info(f"Successfully auto-seeded {len(seed_products)} initial retail products into the database.")
            else:
                logger.info("Products table already populated. Skipping seeding.")
        finally:
            db.close()
    except Exception as exc:
        logger.error(f"Error during database initialization/seeding: {exc}", exc_info=True)
