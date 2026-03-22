# API Gateway – Replika Instagrama

Ovaj folder sadrži **API Gateway** za mikroservisnu aplikaciju "Replika Instagrama".  
Gateway pruža jedinstvenu tačku pristupa svim mikroservisima, vodi računa o autentikaciji, rutiranju, rate limitingu i centralizovanoj obradi grešaka.

---

## **Struktura projekta**

```
api-gateway/
│
├── config/
│   └── services.js          # Adrese svih mikroservisa (profile, follow, auth, post, feed, ...)
│
├── middleware/
│   ├── authMiddleware.js    # Provera JWT tokena, upis x-user-id i x-username u request header, validacija protiv Redis blacklist-e
│   ├── rateLimiter.js       # Rate limiting logika
│   └── errorHandler.js      # Jedinstven error handler (hvata sve greške iz ruta i proxy-a)
│
├── .env                     # Environment promenljive gatewaya (port, JWT_SECRET, REDIS_URL)
├── server.js                # Glavni fajl – konfiguracija express servera, mount-ovanje middleware-a, i proxy ka mikroservisima
```

---

## **Opis glavnih komponenti**

### **1. config/services.js**
- Definiše mapping svih dostupnih mikroservisa (profile, follow, authentication, feed, interactions, post).
- Svaki servis ima svoj "kljuc" (npr. `profile`, `follow`) i URL na koji se request rutira.

### **2. middleware/authMiddleware.js**
- **Autorizacioni sloj Gateway-a** – Svi zahtevi (osim javnih ruta: login/register) OBAVEZNO prolaze kroz ovaj sloj.
- **Šta radi:**
  - Vadi JWT iz `Authorization` headera
  - Proverava da li je token blokiran na Redis **blacklist** listi (tokom logout-a ili kompromitacije, authentication servis ga upisuje u Redis)
  - Validira token preko JWT_SECRET
  - Iz validiranog tokena vadi `userId` i `username` i **upisuje ih u custom headere** (`x-user-id`, `x-username`)
  - Prosleđuje dalje request mikroservisima koji **nemaju nikakvu auth logiku** već samo koriste `x-user-id`
  - Javne rute (`/api/authentication/login`, `/api/authentication/register`) su izuzete iz ove provere

### **3. middleware/rateLimiter.js**
- Ograničava broj zahteva po korisniku/IP adresi u određenom vremenskom periodu, brani gateway od zloupotrebe.

### **4. middleware/errorHandler.js**
- Centralno hvatanje i obrada grešaka – bilo koji error od mikroservisa/Express ide kroz isti handler.

### **5. server.js**
- Inicijalizuje Express app.
- Učitava .env (port, jwt ključ, redis url).
- Dodaje middlware-e (auth, rate limiting, error handling).
- Kroz **`http-proxy-middleware`** automatski rutira sve rute (`/api/<servis>`) do odgovarajućih mikroservisa.
- Piše log pokretanja servera.

### **6. .env**
- Sadrži JWT_SECRET (isti kao u authentication servisu!), REDIS_URL (lokacija Redis servera, koristi se za JWT blacklist-u), PORT gateway servera.

---

## **Autentikacija & Redis integracija**

- Gateway **jedini radi JWT validaciju**. Svi ostali mikroservisi za identitet korisnika koriste ono što gateway stavi u header (`x-user-id`).
- **Logout** i zaštita od kompromitacije tokena:  
  Kada se korisnik izloguje, authentication servis upisuje njegov JWT token u Redis blacklist-u. Gateway proverava taj token pri svakom zahtevu (putem Redis-a).
- **Redis instance** je zajednička između authentication servisa (upisuje blacklist) i gateway-a (proverava blacklist-u).

---

## **Šta je do sada implementirano**

- Potpuno funkcionalan **gateway** sa:
  - JWT validacijom
  - Redis blacklist proverom
  - Upisom x-user-id i x-username u headere
  - Rate limiter middleware-om
  - Proxy-jem za sve mikroservise prema servis mappingu
  - Centralizovanim error handler-om
- Migriran jwt/auth kod iz mikroservisa u gateway (mikroservisi više ne znaju za JWT, već čitaju identitet iz headera)

---



