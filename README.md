# Instagram Replika

Projektni zadatak iz predmeta: Projektovanje informacionih sistema i baza podataka

Ovaj projekat predstavlja funkcionalnu repliku društvene mreže Instagram, dizajniranu i implementiranu u formi mikroservisne arhitekture. Aplikacija omogućava autentifikaciju korisnika, deljenje multimedijalnog sadržaja, interakcije (lajkovi i komentari), kao i praćenje korisnika (javnih i privatnih profila).

---

## 1. Arhitektura aplikacije

Sistem je dizajniran korišćenjem mikroservisne arhitekture, gde je svaka poslovna logika izolovana u sopstveni servis. Svi servisi su kontejnerizovani putem Docker-a.

Ključne komponente sistema su:
* Frontend (React.js): Korisnički interfejs koncipiran kao Single Page Application (SPA).
* API Gateway: Jedina ulazna tačka za klijenta. Rutira sve HTTP zahteve ka odgovarajućim mikroservisima i vrši proveru JWT tokena (Rate limiting & Auth Middleware).
* Auth Service: Upravlja registracijom, prijavom i generisanjem JWT tokena.
* Profile Service: Upravlja korisničkim profilima (javni/privatni), pretragom korisnika i uređivanjem profilnih podataka.
* Follow Service: Reguliše odnose između korisnika (praćenje, zahtevi za praćenje kod privatnih profila, blokiranje).
* Post Service: Omogućava kreiranje, brisanje i pregled objava, kao i bezbedno čuvanje fajlova.
* Interactions Service: Upravlja "lajkovima" i komentarima na objavama (dodavanje, izmena, brisanje).
* Feed Service: Generiše hronološku vremensku liniju (Timeline) spajanjem objava praćenih korisnika, njihovih lajkova i komentara.
* MySQL: Sistem za upravljanje relacionim bazama podataka.
* MinIO: (Object storage) kompatibilan sa Amazon S3, zadužen za bezbedno i skalabilno čuvanje slika i video zapisa (do 50MB po fajlu, maks 20 fajlova po objavi).

---

## 2. Tok izvršavanja funkcionalnosti (Execution Flow)

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

## 3. Uputstvo za pokretanje aplikacije

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

## 4. Testiranje i CI/CD Pipeline
Kontinualna integracija i isporuka su automatizovane putem GitHub Actions:

Pull Requests: Otvaranje PR-a automatski pokreće jedinične (Unit) testove.

Merge on Main: Svaki komit na main grani pokreće jedinične testove. Ukoliko testovi prođu, kreiraju se Docker slike (images) koje se automatski otpremaju na javni Docker repozitorijum uz tagovanje u formatu yyyymmdd-hhmmss.

*Pokrivenost kodom:
- Backend servisi su pokriveni jediničnim testovima (minimum 70% pokrivenosti).
- Frontend sadrži UI jedinične testove napisane pomoću Jest i React Testing Library (pokrivenost preko 10%).
- Implementirani su API integracioni testovi (Backend) i UI integracioni testovi.

*Lokalno pokretanje testova:
- Pokretanje svih Backend Unit testova: npm test
- Pokretanje API Integracionih testova(iz integration-tests): npm run test:integration
- Pokretanje Frontend UI testova: npm run e2e 

---

## 5. Dijagram

(ovde ide slika koju budemo napravili)!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

---

## 6. Definisana poboljšanja (Future Improvements)
- Direktne poruke (Chat): Implementacija sistema za razmenu poruka u realnom vremenu korišćenjem WebSockets tehnologije za privatne razgovore između korisnika.
- Stories i Reels: Dodavanje podrške za privremeni sadržaj u trajanju od 24 sata (Stories) i kratke video formate (Reels) sa optimizovanim strimovanjem videa.
- Sistem za preporuke (Recommendation Engine): Zamena isključivo hronološkog prikaza objava (feed-a) algoritmom za preporuke baziranim na veštačkoj inteligenciji i mašinskom učenju (AI/ML), koji će predlagati objave i naloge na osnovu korisničkih interakcija i angažovanja.
- Admin panel i moderacija: Kreiranje pozadinskog panela (back-office) za administratore kako bi mogli da moderišu prijavljene korisnike i uklanjaju/označavaju neprikladan sadržaj.

---

## 7. Članovi tima i uloge
- Ksenija Živković (658-2022) - Frontend Engineer (Zadužena za razvoj grafičkog korisničkog interfejsa u React-u, povezivanje sa Gateway-em i pisanje Frontend Unit testova).
- Aleksa Milenković (647-2021) - Backend Engineer A (Zadužen za razvoj biznis logike (Auth, Profile servisi), pisanje Unit testova, kao i DevOps aktivnosti: implementaciju CI/CD toka, Dockerfile i docker-compose fajlova).
- Emilija Mladenović (602-2022) - Backend Engineer B (Zadužena za razvoj biznis logike (Post, Interactions servisi), definisanje modela podataka, pisanje Unit testova i API integracionih testova).
- Ana Urukalo (601-2022) - Backend Engineer C (Zadužena za razvoj biznis logike (Follow, Feed servisi), definisanje modela podataka, pisanje Unit testova i UI integracionih testova).	

(˶ᵔ ᵕ ᵔ˶)



