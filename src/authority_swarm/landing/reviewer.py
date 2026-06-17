import json

from pydantic import TypeAdapter

from authority_swarm.llm import chat
from authority_swarm.models import LandingReview


SYSTEM = """Sos el revisor de claims de landing pages de PC MIDI Center.
Tu trabajo es detectar riesgos antes de aprobar una landing.
Devolve solo JSON valido.
"""


def review_landing(landing_id: int, markdown: str) -> LandingReview:
    user = f"""Landing #{landing_id}

Contenido:
{markdown[:7000]}

Revisar que NO afirme:
- stock o disponibilidad garantizada
- precios
- distribuidor oficial
- soporte tecnico oficial
- exclusividad
- reparaciones, alquileres, clases, grabacion, mezcla o mastering
- que PCMidi fabrica productos de terceros

Formato JSON exacto:
{{
  "landing_id": {landing_id},
  "verdict": "approve|revise|reject",
  "risk_level": "low|medium|high",
  "issues": ["problema concreto"],
  "recommendations": ["cambio concreto"]
}}
"""
    raw = chat(SYSTEM, user, temperature=0.1)
    data = json.loads(raw.strip().removeprefix("```json").removesuffix("```").strip())
    return TypeAdapter(LandingReview).validate_python(data)
