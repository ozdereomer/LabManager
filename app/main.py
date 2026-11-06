from fastapi import FastAPI, Depends, HTTPException, Query, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.database import engine, get_db
from app.models import Laboratory, Equipment, User
from app.schemas.laboratory import LaboratoryCreate, LaboratoryResponse, LaboratoryUpdate
from app.schemas.equipment import EquipmentCreate, EquipmentResponse, EquipmentUpdate
from app.schemas.auth import UserCreate, UserResponse, TokenResponse
from app.security import hash_password, verify_password
from app.auth import create_access_token, get_current_user
app = FastAPI(
    title="LabManager API",
    description="Laboratuvar ve ekipman yönetim sistemi",
    version="0.1.0"
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
        location=laboratory.location
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
    return db.query(Laboratory).all()
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
        Laboratory.id == laboratory_id
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

    total = db.query(Equipment).count()

    available = db.query(Equipment).filter(
        Equipment.status == "available"
    ).count()

    maintenance = db.query(Equipment).filter(
        Equipment.status == "maintenance"
    ).count()

    broken = db.query(Equipment).filter(
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
        Laboratory.id == equipment.laboratory_id
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
    query = db.query(Equipment)

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
    existing_equipment = db.query(Equipment).filter(
        Equipment.id == equipment_id
    ).first()

    if existing_equipment is None:
        raise HTTPException(
            status_code=404,
            detail="Equipment not found"
        )

    laboratory = db.query(Laboratory).filter(
        Laboratory.id == equipment.laboratory_id
    ).first()

    if laboratory is None:
        raise HTTPException(
            status_code=404,
            detail="Laboratory not found"
        )

    duplicate = db.query(Equipment).filter(
        Equipment.serial_number == equipment.serial_number,
        Equipment.id != equipment_id
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
    equipment = db.query(Equipment).filter(
        Equipment.id == equipment_id
    ).first()

    if equipment is None:
        raise HTTPException(
            status_code=404,
            detail="Equipment not found"
        )

    db.delete(equipment)
    db.commit()

    return {
        "message": "Equipment deleted successfully",
        "equipment_id": equipment_id
    }
@app.put("/laboratories/{laboratory_id}", response_model=LaboratoryResponse)
def update_laboratory(
    laboratory_id: int,
    laboratory: LaboratoryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    existing_laboratory = db.query(Laboratory).filter(
        Laboratory.id == laboratory_id
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
        Laboratory.id == laboratory_id
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
