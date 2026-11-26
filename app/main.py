from decimal import Decimal
from sqlalchemy import func, case

from app.schemas.dashboard import (
    DashboardStats,
    DashboardLaboratory,
    DashboardMaintenance,
    DashboardResponse
)

from fastapi import FastAPI, Depends, HTTPException, Query, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
import logging
from app.database import engine, get_db
from app.models import Laboratory, Equipment, User, MaintenanceRecord
from app.schemas.laboratory import LaboratoryCreate, LaboratoryResponse, LaboratoryUpdate
from app.schemas.equipment import EquipmentCreate, EquipmentResponse, EquipmentUpdate
from app.schemas.maintenance import (
    MaintenanceCreate,
    MaintenanceResponse,
    MaintenanceUpdate
)
from app.schemas.auth import UserCreate, UserResponse, TokenResponse
from app.security import hash_password, verify_password
from app.auth import create_access_token, get_current_user
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s"
)

logger = logging.getLogger("labmanager")

app = FastAPI(
    title="LabManager API",
    description="Laboratuvar ve ekipman yönetim sistemi",
    version="0.1.0"
)

@app.exception_handler(Exception)
async def global_exception_handler(request, exc):
    logger.exception(
        "Unhandled exception: %s %s",
        request.method,
        request.url.path
    )

    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"}
    )

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["\*"],
    allow_headers=["\*"],
)

@app.get("/")
def home():
    return {
        "message": "LabManager API is running!",
        "version": "0.1.0"
    }


@app.get("/health")
def health():
    return {
        "status": "healthy"
    }


# AUTHENTICATION ENDPOINTS

@app.post("/register", response_model=UserResponse, status_code=201)
def register_user(
    user: UserCreate,
    db: Session = Depends(get_db)
):
    existing_user = db.query(User).filter(
        User.email == user.email
    ).first()

    if existing_user:
        raise HTTPException(
            status_code=409,
            detail="Email already registered"
        )

    new_user = User(
        email=user.email,
        hashed_password=hash_password(user.password)
    )

    db.add(new_user)

    try:
        db.commit()
        db.refresh(new_user)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Email already registered"
        )

    return new_user


@app.post("/login", response_model=TokenResponse)
def login_user(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(
        User.email == form_data.username
    ).first()

    if not user or not verify_password(
        form_data.password,
        user.hashed_password
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"}
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user"
        )

    access_token = create_access_token(user.email)

    return {
        "access_token": access_token,
        "token_type": "bearer"
    }
# LABORATORY ENDPOINTS

@app.post("/laboratories", response_model=LaboratoryResponse, status_code=201)
def create_laboratory(
    laboratory: LaboratoryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    new_laboratory = Laboratory(
        name=laboratory.name,
        location=laboratory.location,
        user_id=current_user.id
    )

    db.add(new_laboratory)
    db.commit()
    db.refresh(new_laboratory)

    return new_laboratory
@app.get("/laboratories", response_model=list[LaboratoryResponse])
def get_laboratories(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return db.query(Laboratory).filter(
        Laboratory.user_id == current_user.id
    ).all()
@app.get(
    "/laboratories/{laboratory_id}/equipment",
    response_model=list[EquipmentResponse]
)
def get_laboratory_equipment(
    laboratory_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    laboratory = db.query(Laboratory).filter(
    Laboratory.id == laboratory_id,
    Laboratory.user_id == current_user.id
).first()

    if laboratory is None:
        raise HTTPException(
            status_code=404,
            detail="Laboratory not found"
        )

    return db.query(Equipment).filter(
        Equipment.laboratory_id == laboratory_id
    ).all()
# EQUIPMENT ENDPOINTS
@app.get("/equipment/stats", response_model=dict[str, int])
def get_equipment_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    user_laboratory_ids = db.query(Laboratory.id).filter(
        Laboratory.user_id == current_user.id
    ).subquery()

    total = db.query(Equipment).filter(
        Equipment.laboratory_id.in_(user_laboratory_ids)
    ).count()

    available = db.query(Equipment).filter(
        Equipment.laboratory_id.in_(user_laboratory_ids),
        Equipment.status == "available"
    ).count()

    maintenance = db.query(Equipment).filter(
        Equipment.laboratory_id.in_(user_laboratory_ids),
        Equipment.status == "maintenance"
    ).count()

    broken = db.query(Equipment).filter(
        Equipment.laboratory_id.in_(user_laboratory_ids),
        Equipment.status == "broken"
    ).count()

    return {
        "total": total,
        "available": available,
        "maintenance": maintenance,
        "broken": broken
    }
@app.post("/equipment", response_model=EquipmentResponse, status_code=201)
def create_equipment(
    equipment: EquipmentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    laboratory = db.query(Laboratory).filter(
    Laboratory.id == equipment.laboratory_id,
    Laboratory.user_id == current_user.id
).first()
    if laboratory is None:
        raise HTTPException(
            status_code=404,
            detail="Laboratory not found"
        )

    new_equipment = Equipment(
        name=equipment.name,
        serial_number=equipment.serial_number,
        status=equipment.status,
        laboratory_id=equipment.laboratory_id
    )

    try:
        db.add(new_equipment)
        db.commit()
        db.refresh(new_equipment)

    except IntegrityError:
        db.rollback()

        raise HTTPException(
            status_code=409,
            detail="This serial number already exists"
        )

    return new_equipment
@app.get("/equipment", response_model=list[EquipmentResponse])
def get_equipment(
    name: str | None = None,
    serial_number: str | None = None,
    status: str | None = None,
    laboratory_id: int | None = None,
    sort_by: str = "id",
    order: str = "asc",
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(Equipment).join(
        Laboratory,
        Equipment.laboratory_id == Laboratory.id
    ).filter(
        Laboratory.user_id == current_user.id
    )

    if name:
        query = query.filter(
            Equipment.name.ilike(f"%{name}%")
        )

    if serial_number:
        query = query.filter(
            Equipment.serial_number.ilike(f"%{serial_number}%")
        )

    if status:
        query = query.filter(
            Equipment.status == status
        )

    if laboratory_id:
        query = query.filter(
            Equipment.laboratory_id == laboratory_id
        )

    sort_columns = {
        "id": Equipment.id,
        "name": Equipment.name,
        "serial_number": Equipment.serial_number
    }

    if sort_by not in sort_columns:
        raise HTTPException(
            status_code=400,
            detail="Invalid sort field"
        )

    if order not in ["asc", "desc"]:
        raise HTTPException(
            status_code=400,
            detail="Order must be asc or desc"
        )

    column = sort_columns[sort_by]

    if order == "desc":
        query = query.order_by(column.desc())
    else:
        query = query.order_by(column.asc())

    return query.offset(skip).limit(limit).all()
# UPDATE EQUIPMENT

@app.put("/equipment/{equipment_id}", response_model=EquipmentResponse)
def update_equipment(
    equipment_id: int,
    equipment: EquipmentUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    existing_equipment = db.query(Equipment).join(
    Laboratory,
    Equipment.laboratory_id == Laboratory.id
).filter(
    Equipment.id == equipment_id,
    Laboratory.user_id == current_user.id
).first()

    if existing_equipment is None:
        raise HTTPException(
            status_code=404,
            detail="Equipment not found"
        )

    laboratory = db.query(Laboratory).filter(
    Laboratory.id == equipment.laboratory_id,
    Laboratory.user_id == current_user.id
).first()

    if laboratory is None:
        raise HTTPException(
            status_code=404,
            detail="Laboratory not found"
        )

    duplicate = db.query(Equipment).join(
    Laboratory,
    Equipment.laboratory_id == Laboratory.id
).filter(
    Equipment.serial_number == equipment.serial_number,
    Equipment.id != equipment_id,
    Laboratory.user_id == current_user.id
).first()

    if duplicate:
        raise HTTPException(
            status_code=409,
            detail="This serial number already exists"
        )

    existing_equipment.name = equipment.name
    existing_equipment.serial_number = equipment.serial_number
    existing_equipment.status = equipment.status
    existing_equipment.laboratory_id = equipment.laboratory_id

    try:
        db.commit()
        db.refresh(existing_equipment)

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="This serial number already exists"
        )

    return existing_equipment
# DELETE EQUIPMENT

@app.delete("/equipment/{equipment_id}")
def delete_equipment(
    equipment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    equipment = db.query(Equipment).join(
    Laboratory,
    Equipment.laboratory_id == Laboratory.id
).filter(
    Equipment.id == equipment_id,
    Laboratory.user_id == current_user.id
).first()

    if equipment is None:
        raise HTTPException(
            status_code=404,
            detail="Equipment not found"
        )

    maintenance_exists = db.query(MaintenanceRecord).filter(
        MaintenanceRecord.equipment_id == equipment_id
    ).first()

    if maintenance_exists is not None:
        raise HTTPException(
            status_code=409,
            detail="Cannot delete equipment with maintenance records"
        )

    db.delete(equipment)
    db.commit()

    return {
        "message": "Equipment deleted successfully",
        "equipment_id": equipment_id
    }

# MAINTENANCE ENDPOINTS

@app.get("/maintenance", response_model=list[MaintenanceResponse])
def get_maintenance_records(
    equipment_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = db.query(MaintenanceRecord).join(
        Equipment,
        MaintenanceRecord.equipment_id == Equipment.id
    ).join(
        Laboratory,
        Equipment.laboratory_id == Laboratory.id
    ).filter(
        Laboratory.user_id == current_user.id
    )

    if equipment_id is not None:
        query = query.filter(
            MaintenanceRecord.equipment_id == equipment_id
        )

    return query.order_by(
        MaintenanceRecord.maintenance_date.desc()
    ).all()


@app.post(
    "/maintenance",
    response_model=MaintenanceResponse,
    status_code=201
)
def create_maintenance_record(
    maintenance: MaintenanceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    equipment = db.query(Equipment).join(
        Laboratory,
        Equipment.laboratory_id == Laboratory.id
    ).filter(
        Equipment.id == maintenance.equipment_id,
        Laboratory.user_id == current_user.id
    ).first()

    if equipment is None:
        raise HTTPException(
            status_code=404,
            detail="Equipment not found"
        )

    new_record = MaintenanceRecord(
        equipment_id=maintenance.equipment_id,
        maintenance_date=maintenance.maintenance_date,
        description=maintenance.description,
        technician=maintenance.technician,
        cost=maintenance.cost
    )

    db.add(new_record)
    db.commit()
    db.refresh(new_record)

    return new_record


@app.put(
    "/maintenance/{maintenance_id}",
    response_model=MaintenanceResponse
)
def update_maintenance_record(
    maintenance_id: int,
    maintenance: MaintenanceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    existing_record = db.query(MaintenanceRecord).join(
        Equipment,
        MaintenanceRecord.equipment_id == Equipment.id
    ).join(
        Laboratory,
        Equipment.laboratory_id == Laboratory.id
    ).filter(
        MaintenanceRecord.id == maintenance_id,
        Laboratory.user_id == current_user.id
    ).first()

    if existing_record is None:
        raise HTTPException(
            status_code=404,
            detail="Maintenance record not found"
        )

    equipment = db.query(Equipment).join(
        Laboratory,
        Equipment.laboratory_id == Laboratory.id
    ).filter(
        Equipment.id == maintenance.equipment_id,
        Laboratory.user_id == current_user.id
    ).first()

    if equipment is None:
        raise HTTPException(
            status_code=404,
            detail="Equipment not found"
        )

    existing_record.equipment_id = maintenance.equipment_id
    existing_record.maintenance_date = maintenance.maintenance_date
    existing_record.description = maintenance.description
    existing_record.technician = maintenance.technician
    existing_record.cost = maintenance.cost

    db.commit()
    db.refresh(existing_record)

    return existing_record


@app.delete("/maintenance/{maintenance_id}")
def delete_maintenance_record(
    maintenance_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    record = db.query(MaintenanceRecord).join(
        Equipment,
        MaintenanceRecord.equipment_id == Equipment.id
    ).join(
        Laboratory,
        Equipment.laboratory_id == Laboratory.id
    ).filter(
        MaintenanceRecord.id == maintenance_id,
        Laboratory.user_id == current_user.id
    ).first()

    if record is None:
        raise HTTPException(
            status_code=404,
            detail="Maintenance record not found"
        )

    db.delete(record)
    db.commit()

    return {
        "message": "Maintenance record deleted successfully",
        "maintenance_id": maintenance_id
    }
@app.put("/laboratories/{laboratory_id}", response_model=LaboratoryResponse)
def update_laboratory(
    laboratory_id: int,
    laboratory: LaboratoryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    existing_laboratory = db.query(Laboratory).filter(
    Laboratory.id == laboratory_id,
    Laboratory.user_id == current_user.id
).first()

    if existing_laboratory is None:
        raise HTTPException(
            status_code=404,
            detail="Laboratory not found"
        )

    existing_laboratory.name = laboratory.name
    existing_laboratory.location = laboratory.location

    db.commit()
    db.refresh(existing_laboratory)

    return existing_laboratory
@app.delete("/laboratories/{laboratory_id}")
def delete_laboratory(
    laboratory_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    laboratory = db.query(Laboratory).filter(
    Laboratory.id == laboratory_id,
    Laboratory.user_id == current_user.id
).first()

    if laboratory is None:
        raise HTTPException(
            status_code=404,
            detail="Laboratory not found"
        )

    equipment_exists = db.query(Equipment).filter(
        Equipment.laboratory_id == laboratory_id
    ).first()

    if equipment_exists is not None:
        raise HTTPException(
            status_code=409,
            detail="Cannot delete laboratory with existing equipment"
        )

    db.delete(laboratory)
    db.commit()

    return {
        "message": "Laboratory deleted successfully",
        "laboratory_id": laboratory_id
    }
# DASHBOARD ENDPOINT

@app.get("/dashboard", response_model=DashboardResponse)
def get_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Laboratuvar sayısı
    total_laboratories = db.query(
        func.count(Laboratory.id)
    ).filter(
        Laboratory.user_id == current_user.id
    ).scalar()

    # Ekipman istatistikleri
    equipment_stats = db.query(
        func.count(Equipment.id).label("total"),
        func.coalesce(
            func.sum(case((Equipment.status == "available", 1), else_=0)), 0
        ).label("available"),
        func.coalesce(
            func.sum(case((Equipment.status == "maintenance", 1), else_=0)), 0
        ).label("maintenance"),
        func.coalesce(
            func.sum(case((Equipment.status == "broken", 1), else_=0)), 0
        ).label("broken")
    ).join(
        Laboratory,
        Equipment.laboratory_id == Laboratory.id
    ).filter(
        Laboratory.user_id == current_user.id
    ).one()

    # Bakım istatistikleri
    maintenance_stats = db.query(
        func.count(MaintenanceRecord.id).label("total"),
        func.coalesce(
            func.sum(MaintenanceRecord.cost),
            Decimal("0.00")
        ).label("total_cost")
    ).join(
        Equipment,
        MaintenanceRecord.equipment_id == Equipment.id
    ).join(
        Laboratory,
        Equipment.laboratory_id == Laboratory.id
    ).filter(
        Laboratory.user_id == current_user.id
    ).one()

    # Laboratuvarlar ve ekipman sayıları
    laboratories = db.query(
        Laboratory.id,
        Laboratory.name,
        Laboratory.location,
        func.count(Equipment.id).label("equipment_count")
    ).outerjoin(
        Equipment,
        Equipment.laboratory_id == Laboratory.id
    ).filter(
        Laboratory.user_id == current_user.id
    ).group_by(
        Laboratory.id,
        Laboratory.name,
        Laboratory.location
    ).order_by(
        Laboratory.id
    ).all()

    # Son 5 bakım işlemi
    recent_maintenance = db.query(
        MaintenanceRecord.id,
        MaintenanceRecord.equipment_id,
        Equipment.name.label("equipment_name"),
        MaintenanceRecord.maintenance_date,
        MaintenanceRecord.description,
        MaintenanceRecord.technician,
        MaintenanceRecord.cost
    ).join(
        Equipment,
        MaintenanceRecord.equipment_id == Equipment.id
    ).join(
        Laboratory,
        Equipment.laboratory_id == Laboratory.id
    ).filter(
        Laboratory.user_id == current_user.id
    ).order_by(
        MaintenanceRecord.maintenance_date.desc(),
        MaintenanceRecord.id.desc()
    ).limit(5).all()

    return DashboardResponse(
        user_email=current_user.email,
        stats=DashboardStats(
            total_laboratories=total_laboratories,
            total_equipment=equipment_stats.total,
            available_equipment=equipment_stats.available,
            maintenance_equipment=equipment_stats.maintenance,
            broken_equipment=equipment_stats.broken,
            total_maintenance_records=maintenance_stats.total,
            total_maintenance_cost=maintenance_stats.total_cost
        ),
        laboratories=[
            DashboardLaboratory(**row._mapping)
            for row in laboratories
        ],
        recent_maintenance=[
            DashboardMaintenance(**row._mapping)
            for row in recent_maintenance
        ]
    )
