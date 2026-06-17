from dataclasses import dataclass


@dataclass(frozen=True)
class SourceGroup:
    name: str
    sites: tuple[str, ...]
    description: str


SOURCE_GROUPS = {
    "youtube": SourceGroup(
        name="youtube",
        sites=("youtube.com",),
        description="Videos y comentarios indexados de YouTube.",
    ),
    "instagram": SourceGroup(
        name="instagram",
        sites=("instagram.com",),
        description="Posts publicos indexados de Instagram; no scrapea comentarios privados ni contenido logueado.",
    ),
    "gearspace": SourceGroup(
        name="gearspace",
        sites=("gearspace.com",),
        description="Foros tecnicos de audio, sintetizadores, estudios y produccion.",
    ),
    "forums": SourceGroup(
        name="forums",
        sites=(
            "forum.ableton.com",
            "kvraudio.com/forum",
            "vi-control.net/community",
            "modwiggler.com/forum",
            "homerecording.com/bbs",
        ),
        description="Foros de produccion, VSTs, Ableton, sintes y home recording.",
    ),
    "latin": SourceGroup(
        name="latin",
        sites=(
            "hispasonic.com/foros",
            "musicosonline.com",
            "taringa.net",
        ),
        description="Comunidades hispanas donde aparecen consultas de compra y produccion.",
    ),
}


def sites_for(groups: list[str]) -> list[str]:
    sites: list[str] = []
    for group in groups:
        source_group = SOURCE_GROUPS.get(group)
        if source_group:
            sites.extend(source_group.sites)
    return sites
