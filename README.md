# LGTM

Shared photo wall with Portuguese tile aesthetics. Upload photos, apply color filters and kaleidoscope effects, draw on them, and save.

## Setup

```
npm install
npm start
```

Open http://localhost:8080

## Deploy (Azure)

```
az webapp up --name lgtm --runtime "NODE:22-lts" --sku F1
```

## Stack

- Node.js / Express
- Multer (file uploads)
- Canvas-based image editor (vanilla JS)
