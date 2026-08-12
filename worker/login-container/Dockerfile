FROM debian:trixie-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    xserver-xorg-core xserver-xorg-video-fbdev x11-xserver-utils \
    chromium xdotool scrot xclip curl ca-certificates \
    python3 python3-pycryptodome \
    && rm -rf /var/lib/apt/lists/*

COPY human-lib.sh /opt/human-lib.sh
COPY extract_cookie.py /opt/extract_cookie.py
COPY read_verification_code.py /opt/read_verification_code.py
COPY run.sh /opt/run.sh
RUN chmod +x /opt/run.sh

CMD ["/opt/run.sh"]
