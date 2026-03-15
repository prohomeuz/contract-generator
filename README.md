# Mini Express Backend

GET so'rovlarni qabul qiladigan mini backend. Docker orqali deploy qilishga tayyor.

## Lokal ishga tushirish

```bash
npm install
npm start
```

## Test qilish

```bash
curl http://localhost:3000/
curl http://localhost:3000/health
curl "http://localhost:3000/echo?name=Ali"
```

## Docker build/run

```bash
docker build -t mini-backend .
docker run -p 3000:3000 -e PORT=3000 mini-backend
```

## Docker Compose

```bash
docker compose up --build
```
