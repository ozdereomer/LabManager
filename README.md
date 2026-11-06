# LabManager – Laboratory and Equipment Management API

LabManager is a RESTful API built with FastAPI for managing laboratories and their equipment. It provides CRUD operations, filtering, sorting, pagination, equipment statistics, and database integration.

## Features

### Laboratory Management
- Create laboratories
- List all laboratories
- Update laboratory information
- Delete laboratories
- List equipment assigned to a laboratory
- Prevent deletion of laboratories that still contain equipment

### Equipment Management
- Create, list, update, and delete equipment
- Unique serial number validation
- Equipment status management:
  - `available`
  - `maintenance`
  - `broken`
- Filter equipment by name, serial number, status, and laboratory
- Combine multiple filters
- Sort by ID, name, or serial number
- Pagination with `skip` and `limit`
- Equipment statistics

### Additional Features
- PostgreSQL database integration
- SQLAlchemy ORM
- Alembic database migrations
- Docker containerization
- Automated tests with pytest

## Tech Stack

- Python 3.12
- FastAPI
- PostgreSQL
- SQLAlchemy
- Pydantic
- Alembic
- Docker
- Pytest

## Project Structure

```text
LabManager/
├── app/
│   ├── main.py
│   ├── database.py
│   ├── models.py
│   └── schemas/
│       ├── __init__.py
│       ├── laboratory.py
│       └── equipment.py
├── migrations/
│   └── versions/
├── tests/
│   ├── conftest.py
│   └── test_api.py
├── .env.example
├── .gitignore
├── Dockerfile
├── compose.yaml
├── alembic.ini
└── requirements.txt
```

## API Endpoints

### General

| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | API information |
| GET | `/health` | Health check |

### Laboratories

| Method | Endpoint | Description |
|---|---|---|
| POST | `/laboratories` | Create a laboratory |
| GET | `/laboratories` | List laboratories |
| GET | `/laboratories/{id}/equipment` | List laboratory equipment |
| PUT | `/laboratories/{id}` | Update a laboratory |
| DELETE | `/laboratories/{id}` | Delete a laboratory |

### Equipment

| Method | Endpoint | Description |
|---|---|---|
| POST | `/equipment` | Create equipment |
| GET | `/equipment` | List and filter equipment |
| GET | `/equipment/stats` | Get equipment statistics |
| PUT | `/equipment/{id}` | Update equipment |
| DELETE | `/equipment/{id}` | Delete equipment |

### Equipment Filtering and Pagination

The equipment endpoint supports:

- `name`
- `serial_number`
- `status`
- `laboratory_id`
- `sort_by`
- `order`
- `skip`
- `limit`

Example:

```http
GET /equipment?status=available&sort_by=name&order=asc&skip=0&limit=10
```

## Installation and Setup

### Requirements

- Docker Engine
- Docker Compose
- A running PostgreSQL container
- A Docker network accessible by both the API and PostgreSQL containers

### Environment Variables

Create a `.env` file in the project root:

```env
POSTGRES_PASSWORD=your_secure_password
```

Use the password configured for your existing PostgreSQL container.

### Database Network

The current Compose configuration expects an existing Docker network named:

```text
postgres-db_default
```

The PostgreSQL container must be reachable using the hostname `postgres-db` on port `5432`, with database `labmanager` and user `labmanager_user`.

### Run the API

Build and start the API:

```bash
sudo docker compose up -d --build
```

Check container status:

```bash
sudo docker compose ps
```

Check API health:

```bash
curl http://127.0.0.1:8001/health
```

## API Documentation

When the API is running, interactive Swagger documentation is available at:

```text
http://localhost:8001/docs
```

Alternative ReDoc documentation:

```text
http://localhost:8001/redoc
```

If the API is running on a remote server with its port bound to localhost, use an SSH tunnel to access it from your local machine.

## Database Migrations

Apply existing Alembic migrations:

```bash
sudo docker exec labmanager-api python -m alembic upgrade head
```

## Running Tests

Build the API image and run the automated test suite:

```bash
sudo docker compose build api
sudo docker compose run --rm api sh -c "python -m pytest -v"
```

The test suite uses an in-memory SQLite database, keeping the PostgreSQL application data separate from test execution.

## Current Project Status

- Backend REST API implemented
- Laboratory and equipment CRUD operations implemented
- Filtering, sorting, and pagination implemented
- PostgreSQL integration configured
- Alembic migrations configured
- Docker deployment configured
- Automated test suite: 36 passing tests

## Future Improvements

- User authentication and authorization
- Frontend dashboard
- Role-based access control
- API deployment and CI/CD automation
- Equipment maintenance history
- Equipment assignment and tracking

## License

License not specified yet.
