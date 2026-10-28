from test_catalog_sync import bl


def test_clean_install_has_blog_identity(monkeypatch):
    monkeypatch.setattr(bl, "_CLIENT_CONFIG", {})
    project = bl.load_vercel_project()
    assert project["projectName"] == "blog-pcmidicenter"
    assert project["projectId"] != "prj_SSQxYnH1j0u6GgmHCqiC2V7ltL1u"
    assert project["orgId"]


def test_other_tenant_never_inherits_pcmidi(monkeypatch):
    monkeypatch.setattr(bl, "_CLIENT_CONFIG", {"slug": "other"})
    assert bl.load_vercel_project() == {}


def test_explicit_tenant_configuration_wins(monkeypatch):
    project = {"projectId": "custom", "orgId": "custom-org"}
    monkeypatch.setattr(bl, "_CLIENT_CONFIG", {"responsePolicy": {"blog": {"deployment": project}}})
    assert bl.load_vercel_project() == project
