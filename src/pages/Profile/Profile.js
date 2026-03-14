import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

function Profile() {
  const navigate = useNavigate();
  const location = useLocation();
  const [pretrazeniKorisnik, setPretrazeniKorisnik] = useState(location.state?.korisnik || null);

  const [tipProfila, setTipProfila] = useState(pretrazeniKorisnik ? 'javni' : 'privatni'); 
  const [statusPracenja, setStatusPracenja] = useState('ne_prati'); 
  const [isEditing, setIsEditing] = useState(false);
  const [blokiran, setBlokiran] = useState(false); 
  
  const [prikaziPratioce, setPrikaziPratioce] = useState(false);
  const [prikaziPrati, setPrikaziPrati] = useState(false);

  const [odabranaObjava, setOdabranaObjava] = useState(null);
  const [trenutnaSlikaIndex, setTrenutnaSlikaIndex] = useState(0);

  const [ucitavamPodatke, setUcitavamPodatke] = useState(false);

  const [mojProfil, setMojProfil] = useState({
    username: "ksenija_dev",
    fullName: "Ksenija",
    bio: "opis 💻✨",
    avatar: "/slike/radnja.jfif",
    followersCount: 0,
    followingCount: 0
  });

  const [listaPratilaca, setListaPratilaca] = useState([
    { id: 1, username: "ana_marija", fullName: "Ana Marija", avatar: "/slike/outfit.jpg" },
    { id: 2, username: "programer_99", fullName: "Marko Marković", avatar: "/slike/radnja.jfif" },
    { id: 3, username: "neko_tajni", fullName: "Neko", avatar: "/slike/outfit.jpg" }
  ]);

  const [tempPodaci, setTempPodaci] = useState({ username: '', fullName: '', bio: '' });

  // ─── POMOĆNA FUNKCIJA ZA IZVLAČENJE TVOG ID-a IZ TOKENA ───
  const getMyUserId = () => {
    const token = localStorage.getItem('token');
    if (!token) return null;
    try {
      const payloadBase64 = token.split('.')[1];
      const decodedPayload = JSON.parse(atob(payloadBase64));
      return decodedPayload.userId;
    } catch (error) {
      return null;
    }
  };

  // ─── UČITAVANJE PROFILA (ALEKSIN SERVIS) ───
  useEffect(() => {
    const fetchMyProfile = async () => {
      const myUserId = getMyUserId();
      const token = localStorage.getItem('token');
      if (!myUserId || !token) return;

      setUcitavamPodatke(true);
      try {
        const response = await fetch(`http://localhost:4000/api/users/${myUserId}`, {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (response.ok) {
          const data = await response.json();
          setMojProfil({
            username: data.user.username || "Nepoznato",
            fullName: data.user.fullName || "Nepoznato",
            bio: data.user.bio || "Nema biografije",
            avatar: data.user.avatarUrl || "/slike/radnja.jfif", 
            followersCount: data.user.followersCount || 0,
            followingCount: data.user.followingCount || 0
          });
        }
      } catch (error) {
        console.error("Greška pri učitavanju pravog profila:", error);
      } finally {
        setUcitavamPodatke(false);
      }
    };

    if (tipProfila === 'moj' && !pretrazeniKorisnik) {
      fetchMyProfile();
    }
  }, [tipProfila, pretrazeniKorisnik]);

  // ─── LOGOUT ───
  const handlePraviLogout = async () => {
    const token = localStorage.getItem('token');
    const refreshToken = localStorage.getItem('refreshToken');

    try {
      if (token) {
        await fetch('http://localhost:4000/api/authentication/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ refreshToken: refreshToken })
        });
      }
    } catch (error) {
      console.error("Greška pri odjavi:", error);
    } finally {
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      navigate('/login');
    }
  };

  // ─── PRAĆENJE KORISNIKA (ANIN SERVIS) ───
  const handleFollowClick = async () => {
    const myId = getMyUserId();
    // Ako pretraženi korisnik nema ID (zbog testiranja), koristimo neki lažni (npr. 2)
    const targetId = pretrazeniKorisnik?.id || 2; 

    if (!myId) {
      console.error("Nisi ulogovana!");
      return;
    }

    try {
      if (statusPracenja === 'ne_prati') {
        // Šaljemo ZAHTEV ZA PRAĆENJE (POST)
        await fetch('http://localhost:4000/api/follow', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-user-id': String(myId) // Anin specijalni header
          },
          body: JSON.stringify({ following_id: targetId })
        });
        setStatusPracenja(tipProfila === 'privatni' ? 'poslat_zahtev' : 'prati');
      } else {
        // Šaljemo PREKID PRAĆENJA (DELETE)
        await fetch('http://localhost:4000/api/unfollow', {
          method: 'DELETE',
          headers: { 
            'Content-Type': 'application/json',
            'x-user-id': String(myId) 
          },
          body: JSON.stringify({ following_id: targetId })
        });
        setStatusPracenja('ne_prati');
      }
    } catch (error) {
      console.error("Greška u Aninom Follow servisu:", error);
    }
  };

  // ─── BLOKIRANJE KORISNIKA (ANIN SERVIS) ───
  const handleBlockClick = async () => {
    const myId = getMyUserId();
    const targetId = pretrazeniKorisnik?.id || 2;

    if (!myId) return;

    try {
      if (!blokiran) {
        // BLOKIRAJ KORISNIKA (POST)
        await fetch('http://localhost:4000/api/block', {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'x-user-id': String(myId) 
          },
          body: JSON.stringify({ blocked_id: targetId }) // Pretpostavljamo da Anin servis očekuje blocked_id u body-ju
        });
        setBlokiran(true);
      } else {
        // ODBLOKIRAJ (Samo vizuelno dok ne dobijemo rutu za unblock, obično DELETE /block)
        setBlokiran(false);
      }
    } catch (error) {
      console.error("Greška u Aninom Block servisu:", error);
    }
  };

  const userProfile = {
    username: pretrazeniKorisnik ? pretrazeniKorisnik.username : (tipProfila === 'moj' ? mojProfil.username : (tipProfila === 'javni' ? "ana_marija" : "neko_tajni")),
    fullName: pretrazeniKorisnik ? pretrazeniKorisnik.fullName : (tipProfila === 'moj' ? mojProfil.fullName : (tipProfila === 'javni' ? "Ana Marija" : "Neko")),
    bio: tipProfila === 'moj' ? mojProfil.bio : "Samo pozitivna energija ✨",
    followers: pretrazeniKorisnik ? 450 : (tipProfila === 'moj' ? mojProfil.followersCount : 890),
    following: pretrazeniKorisnik ? 320 : (tipProfila === 'moj' ? mojProfil.followingCount : 400),
    posts: pretrazeniKorisnik ? 3 : (tipProfila === 'moj' ? 4 : 0),
    avatar: pretrazeniKorisnik ? pretrazeniKorisnik.avatar : (tipProfila === 'moj' ? mojProfil.avatar : "/slike/outfit.jpg")
  };

  const userPostsData = [
    { id: 1, media: ["/slike/radnja.jfif", "/slike/slikaa.jpg"] },
    { id: 2, media: ["/slike/outfit.jpg"] },
    { id: 3, media: ["/slike/macka.jfif"] }
  ];

  const ukloniPratioca = (id) => {
    setListaPratilaca(listaPratilaca.filter(p => p.id !== id));
  };

  const otvoriProzorZaIzmenu = () => {
    setTempPodaci({
      username: mojProfil.username,
      fullName: mojProfil.fullName,
      bio: mojProfil.bio
    });
    setIsEditing(true);
  };

  const sacuvajIzmene = () => {
    setMojProfil({
      ...mojProfil,
      username: tempPodaci.username,
      fullName: tempPodaci.fullName,
      bio: tempPodaci.bio
    });
    setIsEditing(false); 
  };

  const otvoriObjavu = (post) => {
    setOdabranaObjava(post);
    setTrenutnaSlikaIndex(0); 
  };

  const zatvoriObjavu = () => {
    setOdabranaObjava(null);
  };

  const sledecaSlika = (e) => {
    e.stopPropagation(); 
    if (trenutnaSlikaIndex < odabranaObjava.media.length - 1) {
      setTrenutnaSlikaIndex(trenutnaSlikaIndex + 1);
    }
  };

  const prethodnaSlika = (e) => {
    e.stopPropagation();
    if (trenutnaSlikaIndex > 0) {
      setTrenutnaSlikaIndex(trenutnaSlikaIndex - 1);
    }
  };

  const mozeDaVidiSlike = tipProfila === 'moj' || tipProfila === 'javni' || (tipProfila === 'privatni' && statusPracenja === 'prati');

  return (
    <div style={containerStyle}>
      <div style={devToolsStyle}>
        <span style={{fontSize: '12px', fontWeight: 'bold'}}>TESTIRANJE UI: </span> 
        <button onClick={() => { setPretrazeniKorisnik(null); setTipProfila('moj'); setStatusPracenja('ne_prati'); setBlokiran(false); }}>Moj Profil</button>
        <button onClick={() => { setPretrazeniKorisnik(null); setTipProfila('javni'); setStatusPracenja('ne_prati'); setBlokiran(false); }}>Javni Profil</button>
        <button onClick={() => { setPretrazeniKorisnik(null); setTipProfila('privatni'); setStatusPracenja('ne_prati'); setBlokiran(false); }}>Privatni Profil</button>
      </div>

      <div style={headerStyle}>
        <h2 style={{ margin: 0, fontSize: '18px' }}>
          {ucitavamPodatke ? "Učitavanje..." : userProfile.username}
        </h2>
      </div>

      <div style={profileInfoStyle}>
        <img src={userProfile.avatar} alt="Avatar" style={avatarStyle} />
        <div style={statsContainerStyle}>
          <div style={statItemStyle}>
            <strong>{mozeDaVidiSlike ? userPostsData.length : 0}</strong><span style={statLabelStyle}>objava</span>
          </div>
          <div style={{...statItemStyle, cursor: 'pointer'}} onClick={() => mozeDaVidiSlike && setPrikaziPratioce(true)}>
            <strong>{userProfile.followers}</strong><span style={statLabelStyle}>pratilaca</span>
          </div>
          <div style={{...statItemStyle, cursor: 'pointer'}} onClick={() => mozeDaVidiSlike && setPrikaziPrati(true)}>
            <strong>{userProfile.following}</strong><span style={statLabelStyle}>prati</span>
          </div>
        </div>
      </div>

      <div style={bioStyle}>
        <strong>{userProfile.fullName}</strong>
        <p style={{ margin: '5px 0' }}>{userProfile.bio}</p>
      </div>

      <div style={actionButtonStyle}>
        {tipProfila === 'moj' ? (
          <>
            <button onClick={otvoriProzorZaIzmenu} style={editButtonStyle}>Uredi profil</button>
            <button onClick={handlePraviLogout} style={{...editButtonStyle, marginLeft: '5px', backgroundColor: '#efefef', color: 'red'}}>Odjavi se</button>
          </>
        ) : (
          <>
            <button onClick={handleFollowClick} style={statusPracenja === 'ne_prati' ? followButtonStyle : followingButtonStyle}>
              {statusPracenja === 'ne_prati' ? 'Zaprati' : (statusPracenja === 'poslat_zahtev' ? 'Zahtev poslat' : 'Praćenje')}
            </button>
            {/* OVDJE SMO ZAMENILI OBIČAN ONCLICK SA handleBlockClick */}
            <button onClick={handleBlockClick} style={{...followingButtonStyle, marginLeft: '5px', color: blokiran ? 'white' : 'red', backgroundColor: blokiran ? 'red' : '#efefef'}}>
              {blokiran ? 'Odblokiraj' : 'Blokiraj'}
            </button>
          </>
        )}
      </div>

      {!mozeDaVidiSlike ? (
        <div style={privateProfileContainerStyle}>
          <span style={{ fontSize: '50px' }}>⊘</span>
          <h3>Ovaj profil je privatan</h3>
          <p style={{ color: 'gray', textAlign: 'center', margin: '0 20px' }}>Zaprati ovaj profil da bi video/la njegove fotografije.</p>
        </div>
      ) : (
        <div style={gridStyle}>
          {userPostsData.map((post) => (
            <div key={post.id} style={gridItemStyle} onClick={() => otvoriObjavu(post)}>
              <img src={post.media[0]} alt={`Post ${post.id}`} style={gridImageStyle} />
              {post.media.length > 1 && (
                <span style={carouselIconStyle}>❏</span>
              )}
            </div>
          ))}
        </div>
      )}

      {odabranaObjava && (
        <div style={modalOverlayStyle} onClick={zatvoriObjavu}>
          <div style={postModalContentStyle} onClick={(e) => e.stopPropagation()}>
            <button onClick={zatvoriObjavu} style={closeBtnStyleModal}>✕</button>
            
            <div style={carouselContainerStyle}>
              {trenutnaSlikaIndex > 0 && (
                <button onClick={prethodnaSlika} style={leftArrowStyle}>&#8249;</button>
              )}
              
              <img 
                src={odabranaObjava.media[trenutnaSlikaIndex]} 
                alt="Detaljna objava" 
                style={postModalImageStyle} 
              />
              
              {trenutnaSlikaIndex < odabranaObjava.media.length - 1 && (
                <button onClick={sledecaSlika} style={rightArrowStyle}>&#8250;</button>
              )}
            </div>
            
            {odabranaObjava.media.length > 1 && (
              <div style={dotsContainerStyle}>
                {odabranaObjava.media.map((_, idx) => (
                  <span key={idx} style={{...dotStyle, opacity: idx === trenutnaSlikaIndex ? 1 : 0.5}}>•</span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {isEditing && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <h3 style={{ marginTop: 0 }}>Uredi profil</h3>
            <label style={labelStyle}>Ime</label>
            <input type="text" value={tempPodaci.fullName} onChange={(e) => setTempPodaci({...tempPodaci, fullName: e.target.value})} style={inputStyle} />
            <label style={labelStyle}>Korisničko ime</label>
            <input type="text" value={tempPodaci.username} onChange={(e) => setTempPodaci({...tempPodaci, username: e.target.value})} style={inputStyle} />
            <label style={labelStyle}>Biografija</label>
            <textarea value={tempPodaci.bio} onChange={(e) => setTempPodaci({...tempPodaci, bio: e.target.value})} style={textareaStyle} />
            <div style={modalButtonContainerStyle}>
              <button onClick={() => setIsEditing(false)} style={cancelModalBtnStyle}>Odustani</button>
              <button onClick={sacuvajIzmene} style={saveModalBtnStyle}>Sačuvaj</button>
            </div>
          </div>
        </div>
      )}

      {prikaziPratioce && (
        <div style={modalOverlayStyle}>
          <div style={listModalStyle}>
            <div style={listHeaderStyle}>
              <h3 style={{ margin: 0 }}>Pratioci</h3>
              <button onClick={() => setPrikaziPratioce(false)} style={closeBtnStyle}>✕</button>
            </div>
            <div style={listContainerStyle}>
              {listaPratilaca.map(korisnik => (
                <div key={korisnik.id} style={userRowStyle}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <img src={korisnik.avatar} alt="avatar" style={listAvatarStyle} />
                    <div>
                      <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{korisnik.username}</div>
                      <div style={{ color: 'gray', fontSize: '14px' }}>{korisnik.fullName}</div>
                    </div>
                  </div>
                  {tipProfila === 'moj' && (
                    <button onClick={() => ukloniPratioca(korisnik.id)} style={removeBtnStyle}>Ukloni</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {prikaziPrati && (
        <div style={modalOverlayStyle}>
          <div style={listModalStyle}>
            <div style={listHeaderStyle}>
              <h3 style={{ margin: 0 }}>Prati</h3>
              <button onClick={() => setPrikaziPrati(false)} style={closeBtnStyle}>✕</button>
            </div>
            <div style={listContainerStyle}>
              {listaPratilaca.map(korisnik => (
                <div key={korisnik.id} style={userRowStyle}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <img src={korisnik.avatar} alt="avatar" style={listAvatarStyle} />
                    <div>
                      <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{korisnik.username}</div>
                      <div style={{ color: 'gray', fontSize: '14px' }}>{korisnik.fullName}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const containerStyle = { backgroundColor: '#fafafa', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' };
const devToolsStyle = { width: '100%', maxWidth: '470px', backgroundColor: '#ffeaa7', padding: '5px', display: 'flex', gap: '5px', justifyContent: 'center' };
const headerStyle = { width: '100%', maxWidth: '470px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', backgroundColor: 'white', borderBottom: '1px solid #dbdbdb' };
const profileInfoStyle = { width: '100%', maxWidth: '470px', display: 'flex', alignItems: 'center', padding: '20px 15px', backgroundColor: 'white' };
const avatarStyle = { width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', border: '1px solid #dbdbdb' };
const statsContainerStyle = { flex: 1, display: 'flex', justifyContent: 'space-around', marginLeft: '20px' };
const statItemStyle = { display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: '16px' };
const statLabelStyle = { fontSize: '14px', color: 'gray' };
const bioStyle = { width: '100%', maxWidth: '470px', padding: '0 15px 15px 15px', backgroundColor: 'white', fontSize: '14px' };
const actionButtonStyle = { width: '100%', maxWidth: '470px', display: 'flex', justifyContent: 'center', padding: '0 15px 20px 15px', backgroundColor: 'white' };
const editButtonStyle = { width: '100%', padding: '7px 0', backgroundColor: '#efefef', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', flex: 1 };
const followButtonStyle = { width: '100%', padding: '7px 0', backgroundColor: '#0095f6', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', flex: 1 };
const followingButtonStyle = { width: '100%', padding: '7px 0', backgroundColor: '#efefef', color: 'black', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', flex: 1 };
const gridStyle = { width: '100%', maxWidth: '470px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2px', backgroundColor: 'white', borderTop: '1px solid #dbdbdb', paddingTop: '2px', paddingBottom: '70px' };
const gridItemStyle = { width: '100%', aspectRatio: '1 / 1', cursor: 'pointer', position: 'relative' }; 
const gridImageStyle = { width: '100%', height: '100%', objectFit: 'cover' };
const privateProfileContainerStyle = { width: '100%', maxWidth: '470px', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '50px 0', backgroundColor: 'white', borderTop: '1px solid #dbdbdb' };
const modalOverlayStyle = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000 };
const modalContentStyle = { backgroundColor: 'white', padding: '20px', borderRadius: '10px', width: '90%', maxWidth: '400px', display: 'flex', flexDirection: 'column' };
const labelStyle = { fontSize: '14px', fontWeight: 'bold', marginTop: '10px', marginBottom: '5px' };
const inputStyle = { padding: '8px', border: '1px solid #dbdbdb', borderRadius: '5px', outline: 'none' };
const textareaStyle = { padding: '8px', border: '1px solid #dbdbdb', borderRadius: '5px', outline: 'none', resize: 'none', height: '60px' };
const modalButtonContainerStyle = { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' };
const cancelModalBtnStyle = { padding: '8px 15px', backgroundColor: '#efefef', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer' };
const saveModalBtnStyle = { padding: '8px 15px', backgroundColor: '#0095f6', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer' };
const listModalStyle = { backgroundColor: 'white', borderRadius: '10px', width: '90%', maxWidth: '400px', maxHeight: '60vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' };
const listHeaderStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', borderBottom: '1px solid #dbdbdb' };
const closeBtnStyle = { background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', fontWeight: 'bold' };
const listContainerStyle = { padding: '10px 15px', overflowY: 'auto' };
const userRowStyle = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0' };
const listAvatarStyle = { width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', marginRight: '15px', border: '1px solid #dbdbdb' };
const removeBtnStyle = { background: '#efefef', border: 'none', borderRadius: '5px', padding: '5px 12px', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' };

const carouselIconStyle = { position: 'absolute', top: '5px', right: '5px', color: 'white', fontSize: '18px', textShadow: '0 0 5px rgba(0,0,0,0.8)' };
const postModalContentStyle = { position: 'relative', width: '100%', maxWidth: '470px', display: 'flex', flexDirection: 'column', alignItems: 'center' };
const carouselContainerStyle = { position: 'relative', width: '100%', aspectRatio: '1/1', backgroundColor: 'black', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const postModalImageStyle = { width: '100%', height: '100%', objectFit: 'contain' };
const closeBtnStyleModal = { position: 'absolute', top: '-40px', right: '10px', background: 'none', border: 'none', color: 'white', fontSize: '30px', cursor: 'pointer' };
const arrowBase = { position: 'absolute', top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.7)', border: 'none', borderRadius: '50%', width: '30px', height: '30px', fontSize: '20px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center' };
const leftArrowStyle = { ...arrowBase, left: '10px' };
const rightArrowStyle = { ...arrowBase, right: '10px' };
const dotsContainerStyle = { display: 'flex', justifyContent: 'center', gap: '5px', marginTop: '10px' };
const dotStyle = { color: 'white', fontSize: '20px' };

export default Profile;