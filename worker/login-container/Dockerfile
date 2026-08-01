FROM debian:trixie-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    xserver-xorg-core xserver-xorg-video-fbdev x11-xserver-utils \
    chromium xdotool scrot xclip curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY human-lib.sh /opt/human-lib.sh
COPY run.sh /opt/run.sh
RUN chmod +x /opt/run.sh

CMD ["/opt/run.sh"]
