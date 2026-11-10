# PhoneHub store prototype

Beginner-friendly local prototype featuring USD prices, a multi-item cart, delivery/pickup, test orders, product management, order status management, and support/refund tickets.

## Run on Windows
1. Extract the ZIP to a folder such as `C:\Users\pc\Desktop\phonehub`.
2. Open VS Code → File → Open Folder → choose the extracted `phonehub` folder (the folder containing `server.js`).
3. Terminal → New Terminal.
4. Run `npm.cmd install` and wait until it finishes.
5. Run `npm.cmd start`.
6. Open `http://localhost:3000` in Chrome.
7. Admin password for local testing is `change-this-password`. Change it before using outside your own computer by setting the `ADMIN_PASSWORD` environment variable before starting the server.

## Data and limitations
Orders, products, support tickets and settings are saved to `data.json` in this project folder. Keep a backup. This is a local test prototype, not a production deployment. The admin login is a starter mechanism, not a substitute for hardened production authentication, HTTPS, rate limiting, audit logging, secure hosting, database backups and privacy/legal review. Product images currently accept image URLs, not direct file uploads.

## Payments and card security
This prototype deliberately does not collect or store card numbers, CVV, PINs, passwords or one-time passcodes (OTPs), and it has no endpoint that displays such secrets in an admin dashboard. To accept payments later, integrate a reputable provider's hosted checkout. Your server should receive only safe payment metadata such as order ID, amount, provider transaction reference and verified status. Never ask customers to submit OTPs to your own site or collect payment credentials.
