# registro/utils/jsonify.py
from decimal import Decimal
from datetime import date, datetime, time
from uuid import UUID

def jsonable(value):
    if isinstance(value, Decimal):
        # Para auditoria, string evita perda de precisão (ex.: "1.250")
        return str(value)
    if isinstance(value, (datetime, date, time)):
        return value.isoformat()
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, dict):
        return {k: jsonable(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [jsonable(v) for v in value]
    return value
