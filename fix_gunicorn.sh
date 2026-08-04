#!/bin/bash
sudo sed -i 's/--workers 3 --bind/--workers 1 --timeout 120 --preload --bind/' /etc/systemd/system/gunicorn.service
sudo systemctl daemon-reload
sudo systemctl restart gunicorn
sleep 3
sudo systemctl status gunicorn --no-pager
free -h
