# Instagram Replika

Projektni zadatak iz predmeta: Projektovanje informacionih sistema i baza podataka

Ovaj projekat predstavlja funkcionalnu repliku društvene mreže Instagram, dizajniranu i implementiranu u formi mikroservisne arhitekture. Aplikacija omogućava autentifikaciju korisnika, deljenje multimedijalnog sadržaja, interakcije (lajkovi i komentari), kao i praćenje korisnika (javnih i privatnih profila).

---

## 1. Arhitektura mikroservisa i portovi

Sistem je podeljen na više nezavisnih mikroservisa. Svi zahtevi sa klijentske strane idu preko API Gateway-a, koji ih dalje rutira ka odgovarajućim servisima.

| Servis | Kontejner | Eksterni Port (Host) | Interni Port (Docker) | Opis |
| :--- | :--- | :--- | :--- | :--- |
| **API Gateway** | `gateway` | **4000** | 4000 | Ulazna tačka za sve klijentske zahteve |
| **Frontend** | `react-app` | **3000** | 4000 | React korisnički interfejs |
| **Authentication** | `authentication` | - | 3001 | Servis za prijavu, registraciju i JWT tokene |
| **Profile** | `profile` | - | 3010 | Servis za upravljanje korisničkim profilima |
| **Follow** | `follow-service` | - | 3004 | Servis za praćenje (Followers/Following) |
| **Post** | `post-service` | - | 3006 | Servis za kreiranje i učitavanje objava |
| **Interactions**| `interactions-service` | - | 3005 | Servis za lajkove, komentare itd. |
| **Feed** | `feed` | - | 3015 | Servis za generisanje početne strane (Feed-a) |


**Baze podataka i Infrastruktura:**
* **MinIO (Skladištenje slika):** API Port `9000` | Console Port `9001`
* **Redis (Keširanje):** Port `5100` (eksterni) / `6379` (interni)
* **MySQL - Auth DB:** Port `5000`
* **MySQL - Follow DB:** Port `5001`
* **MySQL - Post DB:** Port `5003`
* **MySQL - Interactions DB:** Port `5005`

---

## 2. Rute u aplikaciji (Routes)

Aplikacija koristi strogu podelu na korisnički interfejs (Frontend) i pozadinske servise (Backend API) preko Gateway-a. Neautorizovani korisnici nemaju pristup glavnim stranicama aplikacije.

1. Klijentske rute (Frontend - React)
Pristup većini stranica je zaštićen (`ProtectedRoute`) i zahteva validan JWT token.

| Putanja (Path) | Komponenta | Pristup | Opis |
| :--- | :--- | :--- | :--- |
| `/login` | `Login` |  Javna | Stranica za prijavu postojećih korisnika |
| `/register` | `Register` |  Javna | Stranica za kreiranje novog naloga |
| `/` | `Timeline` |  Zaštićena | Početna strana (Feed) sa objavama praćenih korisnika |
| `/profile` | `Profile` |  Zaštićena | Korisnički profil (prikaz slika, pratilaca i objava) |
| `/create` | `CreatePost` |  Zaštićena | Forma za kreiranje i postavljanje nove objave |
| `/search` | `Search` |  Zaštićena | Pretraga drugih korisnika mreže |
| `/notifications` | `Notifications` |  Zaštićena | Pregled obaveštenja (lajkovi, komentari, zapraćivanja) |

2. API Gateway Rute (Backend)
Svi pozivi ka serveru idu preko API Gateway-a (Port `4000`), koji preusmerava zahtev do odgovarajućeg mikroservisa. Skoro sve rute prolaze kroz autentifikacioni middleware.

| API Endpoint | Preusmerava na (Servis) | Pristup | Limiter |
| :--- | :--- | :--- | :--- |
| `GET /health` | *Gateway* (Lokalno) |  Javni | Globalni |
| `POST /api/authentication/register`| `Authentication` (`/register`) |  Javni | Da (Auth) |
| `POST /api/authentication/login` | `Authentication` (`/login`) |  Javni | Da (Auth) |
| `POST /api/authentication/logout` | `Authentication` (`/logout`) |  Zaštićen | Globalni |
| `GET /api/authentication/me` | `Authentication` (`/me`) |  Zaštićen | Globalni |
| `* /api/profile/*` | `Profile` |  Zaštićen | Globalni |
| `* /api/follow/*` | `Follow` (`/follow`) |  Zaštićen | Globalni |
| `* /api/unfollow/*` | `Follow` (`/unfollow`)|  Zaštićen | Globalni |
| `* /api/block/*` | `Follow` (`/block`) |  Zaštićen | Globalni |
| `* /api/posts/*` | `Post` (`/posts`) |  Zaštićen | Globalni |
| `* /api/interactions/*` | `Interactions` |  Zaštićen | Globalni |
| `* /api/feed/*` | `Feed` (`/feed`) |  Zaštićen | Globalni |

---

## 3. Tok izvršavanja funkcionalnosti (Execution Flow)

*Primer toka podataka prilikom učitavanja Timeline-a (Vremenske linije):

1. Inicijalizacija: Frontend šalje GET zahtev ka http://localhost:4000/api/feed uz prosleđivanje JWT tokena u Authorization hederu.
2. API Gateway: Prihvata zahtev, validira JWT token, ekstraktuje userId iz tokena i prosleđuje zahtev Feed Service-u (dodajući x-user-id heder).
3. Feed Service:
   - Komunicira sa Follow Service-om da bi dobio listu profila koje korisnik prati.
   - Asinhrono (paralelno) komunicira sa Post Service-om kako bi povukao sve objave tih profila.
   - Za svaku objavu komunicira sa Interactions Service-om radi povlačenja broja lajkova, provere da li je korisnik već lajkovao objavu, i preuzimanja komentara.
   - Komunicira sa Profile Service-om kako bi izvukao korisnička imena i avatare autora objava i komentara.
4. Odgovor: Feed Service formatira i vraća objedinjen JSON odgovor API Gateway-u, koji ga prosleđuje Frontend-u.
5. Renderovanje: React aplikacija osvežava stanje i prikazuje učitane objave korisniku.

---

## 4. Uputstvo za pokretanje aplikacije

Aplikacija je u potpunosti kontejnerizovana i pokreće se putem docker-compose alata.

*Preduslovi:
- Instaliran Docker i Docker Compose.
- Slobodni portovi na lokalnoj mašini (3000, 3306, 4000, 9000, itd.).

*Koraci za pokretanje:
1. Klonirajte repozitorijum:
   (bash)
   git clone <https://github.com/ksenijai670/Replika-Instagrama->
   cd <ime-foldera>
2. Pokrenite sve servise u pozadini: docker-compose up --build -d
   I frontend: npm start
4. Aplikacija će biti dostupna u web pregledaču na adresi:
   http://localhost:3000

(Napomena: MinIO će automatski kreirati posts-media bucket prilikom prvog pokretanja Post servisa i dodeliti mu Public polisu pristupa kako bi slike bile vidljive klijentima.)

---

## 5. Testiranje i CI/CD Pipeline
Kontinualna integracija i isporuka su automatizovane putem GitHub Actions:

Pull Requests: Otvaranje PR-a automatski pokreće jedinične (Unit) testove.

Merge on Main: Svaki komit na main grani pokreće jedinične testove. Ukoliko testovi prođu, kreiraju se Docker slike (images) koje se automatski otpremaju na javni Docker repozitorijum uz tagovanje u formatu yyyymmdd-hhmmss.

*Pokrivenost kodom:
- Backend servisi su pokriveni jediničnim testovima (minimum 70% pokrivenosti).
- Frontend sadrži UI jedinične testove napisane pomoću Jest i React Testing Library (pokrivenost preko 10%).
- Implementirani su API integracioni testovi (Backend) i UI integracioni testovi.

*Lokalno pokretanje testova: 
- Pokretanje svih Backend i Frontend Unit testova:
  1. npm install
  2. npm test

- Pokretanje API Integracionih testova(iz integration-tests):
  1. npm install
  2. npm test
   
- Pokretanje UI Integracionih testova:
  1. npm install
  2. npx playwright install
  3. (npm install -D @playwright/test)
  4. npm run e2e

---

## 6. Dijagram

<img width="1453" height="1204" alt="dijagram ak drawio" src="https://github.com/user-attachments/assets/bca3ec38-094f-40aa-a3ba-1ed674dd5cf9" />

---

## 7. Definisana poboljšanja (Future Improvements)
- Direktne poruke (Chat): Implementacija sistema za razmenu poruka u realnom vremenu korišćenjem WebSockets tehnologije za privatne razgovore između korisnika.
- Stories i Reels: Dodavanje podrške za privremeni sadržaj u trajanju od 24 sata (Stories) i kratke video formate (Reels) sa optimizovanim strimovanjem videa.
- Sistem za preporuke (Recommendation Engine): Zamena isključivo hronološkog prikaza objava (feed-a) algoritmom za preporuke baziranim na veštačkoj inteligenciji i mašinskom učenju (AI/ML), koji će predlagati objave i naloge na osnovu korisničkih interakcija i angažovanja.
- Admin panel i moderacija: Kreiranje pozadinskog panela (back-office) za administratore kako bi mogli da moderišu prijavljene korisnike i uklanjaju/označavaju neprikladan sadržaj.

---

## 8. Članovi tima i uloge
- Ksenija Živković (658-2022) - Frontend Engineer (Zadužena za razvoj grafičkog korisničkog interfejsa u React-u, povezivanje sa Gateway-em i pisanje Frontend Unit testova).
- Aleksa Milenković (647-2021) - Backend Engineer A (Zadužen za razvoj biznis logike (Auth, Profile servisi i Feed servisi), pisanje Unit testova, kao i DevOps aktivnosti: implementaciju CI/CD toka, Dockerfile i docker-compose fajlova).
- Emilija Mladenović (602-2022) - Backend Engineer B (Zadužena za razvoj biznis logike (Post, Interactions servisi), definisanje modela podataka, pisanje Unit testova i API integracionih testova).
- Ana Urukalo (601-2022) - Backend Engineer C (Zadužena za razvoj biznis logike (Follow, API Gateway), definisanje modela podataka, pisanje Unit testova i UI integracionih testova).	

(˶ᵔ ᵕ ᵔ˶)



