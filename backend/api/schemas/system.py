from pydantic import BaseModel


class HealthResponse(BaseModel):
    status: str


class RAMResponse(BaseModel):
    ram_gb: float
    recommended_model: str


class ModelStatusResponse(BaseModel):
    key: str
    downloaded: bool
    size_bytes: int
    total_bytes: int
    verified: bool
    description: str = ""
    min_ram_gb: int = 4
