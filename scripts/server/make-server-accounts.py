"""Turn the PC's agents/accounts.json (NSTBrowser profiles) into the pcmidi server's version.

Same account ids, clients, channels and personas, but each account gets its own headless Chrome
profile and CDP port (browserProvider "chrome"). No secrets are involved: credentials stay as
names of .env variables.

    python scripts/server/make-server-accounts.py agents/accounts.json accounts.server.json
"""
import json
import sys

PROFILE_ROOT = "/home/administrador/.local/share/pcmidi-listening"
FIRST_PORT = 9231
DROP = {"browserProvider", "nstbrowserProfileId", "dolphinProfileId", "cdpPort", "chromeProfile", "wsEndpoint"}


def convert(accounts: dict) -> dict:
    out, port = {}, FIRST_PORT
    for key, value in accounts.items():
        if not isinstance(value, dict):
            out[key] = value
            continue
        converted = {k: v for k, v in value.items() if k not in DROP}
        converted.update({"browserProvider": "chrome", "cdpPort": port, "chromeProfile": f"{PROFILE_ROOT}/{key}"})
        out[key] = converted
        port += 1
    return out


if __name__ == "__main__":
    # Written as UTF-8 explicitly: on Windows stdout would be cp1252 and break accented labels.
    with open(sys.argv[1], encoding="utf-8") as source, open(sys.argv[2], "w", encoding="utf-8") as target:
        json.dump(convert(json.load(source)), target, ensure_ascii=False, indent=2)
