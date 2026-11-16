# Deploying the Practice Store

Manual steps for one Linux host (Ubuntu/Debian, systemd, nginx). Nothing here runs by itself. Replace `{{DOMAIN}}` with the
real host name (for example `practice.example.com`) everywhere. The site holds fake data only; still, keep RESET_TOKEN secret,
because anyone with it can reset the data under someone else's test run.

## 1. Prerequisites

```sh
# Node 24 at /usr/bin/node (check):
node --version          # v24.x
sudo apt-get install -y nginx certbot python3-certbot-nginx
```

DNS: an A (and AAAA) record for `{{DOMAIN}}` pointing at the host. Firewall: open 80 and 443 only; port 8080 stays closed
(nginx talks to it on 127.0.0.1).

## 2. Copy the code

```sh
sudo useradd --system --no-create-home --shell /usr/sbin/nologin practice
sudo mkdir -p /opt/practice-store
sudo rsync -a --delete --exclude .git ./ /opt/practice-store/      # run from the test-site folder
sudo chown -R root:root /opt/practice-store                        # the service only reads it
```

## 3. Secrets and switches

```sh
sudo install -m 600 -o root -g root /dev/null /etc/practice-store.env
printf "RESET_TOKEN=%s\nSESSION_SECRET=%s\nTRUST_PROXY=1\n" "$(openssl rand -hex 24)" "$(openssl rand -hex 32)" \
  | sudo tee /etc/practice-store.env >/dev/null
# Optional, only for a defect-hunting copy: echo "BUGS=all" | sudo tee -a /etc/practice-store.env
sudo cat /etc/practice-store.env    # note the token for AI Studio's reset call
```

## 4. Service (pick one)

systemd (recommended):

```sh
sudo cp deploy/practice-store.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now practice-store
curl -s http://127.0.0.1:8080/api/health          # {"ok":true}
```

pm2 instead (if the host already uses pm2): edit `deploy/ecosystem.config.cjs` (path, RESET_TOKEN), then

```sh
pm2 start deploy/ecosystem.config.cjs && pm2 save
```

## 5. nginx and TLS

```sh
sed 's/{{DOMAIN}}/practice.example.com/g' deploy/nginx-practice-store.conf.template \
  | sudo tee /etc/nginx/sites-available/practice-store >/dev/null
sudo ln -s /etc/nginx/sites-available/practice-store /etc/nginx/sites-enabled/
```

The certificate does not exist yet, so the 443 block will not load. Either comment out the 443 server block, `sudo nginx -t &&
sudo systemctl reload nginx`, run `sudo certbot certonly --webroot -w /var/www/certbot -d practice.example.com`
(`sudo mkdir -p /var/www/certbot` first), then uncomment it; or run `sudo certbot --nginx -d practice.example.com` and let it
manage the TLS lines. Then:

```sh
sudo nginx -t && sudo systemctl reload nginx
curl -sI https://practice.example.com/ | head -1                 # HTTP/2 200
curl -s https://practice.example.com/api/health
```

Renewal is handled by certbot's systemd timer (`systemctl list-timers | grep certbot`).

## 6. Update

```sh
sudo rsync -a --delete --exclude .git ./ /opt/practice-store/
sudo systemctl restart practice-store        # also resets all data to the seed
```

## 7. Check it

```sh
node scripts/smoke.mjs        # locally, before copying: starts its own server on 8090-8099 and stops it
```

## Remove

```sh
sudo systemctl disable --now practice-store
sudo rm /etc/systemd/system/practice-store.service /etc/nginx/sites-enabled/practice-store /etc/practice-store.env
sudo systemctl reload nginx
```
