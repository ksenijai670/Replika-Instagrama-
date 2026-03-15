import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

function Profile() {
  const navigate = useNavigate();
  const location = useLocation();
  const [pretrazeniKorisnik] = useState(location.state?.korisnik || null);

  const [tipProfila, setTipProfila] = useState(pretrazeniKorisnik ? 'javni' : 'moj'); 
  const [statusPracenja, setStatusPracenja] = useState('ne_prati'); 
  const [isEditing, setIsEditing] = useState(false);
  const [blokiran, setBlokiran] = useState(false); 
  
  const [prikaziPratioce, setPrikaziPratioce] = useState(false);
  const [prikaziPrati, setPrikaziPrati] = useState(false);

  const [odabranaObjava, setOdabranaObjava] = useState(null);
  const [trenutnaSlikaIndex, setTrenutnaSlikaIndex] = useState(0);
  const [noviKomentar, setNoviKomentar] = useState('');
  
  const [editCommentId, setEditCommentId] = useState(null);
  const [editCommentText, setEditCommentText] = useState('');

  const [ucitavamPodatke, setUcitavamPodatke] = useState(false);
  const [ucitavamListe, setUcitavamListe] = useState(false);

  const [mojProfil, setMojProfil] = useState({
    username: "", firstName: "", lastName: "", fullName: "", bio: "", avatar: "", followersCount: 0, followingCount: 0
  });

  const [listaPratilaca, setListaPratilaca] = useState([]);
  const [userPostsData, setUserPostsData] = useState([]); 
  const [tempPodaci, setTempPodaci] = useState({ firstName: '', lastName: '', bio: '', avatar: '' });

  const getMyUserId = () => {
    const token = localStorage.getItem('token');
    if (!token) return null;
    try {
      const payloadBase64 = token.split('.')[1];
      return JSON.parse(atob(payloadBase64)).userId;
    } catch (error) { return null; }
  };

  useEffect(() => {
    const fetchProfile = async () => {
      const myUserId = getMyUserId();
      const token = localStorage.getItem('token');
      if (!myUserId || !token) return;

      const targetId = pretrazeniKorisnik ? pretrazeniKorisnik.id : myUserId;
      setUcitavamPodatke(true);
      try {
        const response = await fetch(`http://localhost:4000/api/profile/users/${targetId}`, {
          headers: { 'Authorization': `Bearer ${token}`, 'x-user-id': String(myUserId) }
        });

        if (response.ok) {
          const data = await response.json();
          setMojProfil({
            username: data.user.username || 'Nepoznato',
            firstName: data.user.first_name || '',
            lastName: data.user.last_name || '',
            fullName: `${data.user.first_name} ${data.user.last_name}` || 'Nepoznato',
            bio: data.user.bio || '',
            avatar: data.user.profile_image_url || '',
            followersCount: data.user.followers_count || 0,
            followingCount: data.user.following_count || 0,
          });
          setUserPostsData(data.user.posts || []);
          if (data.user.is_following) setStatusPracenja('prati');
        }
      } catch (error) { console.error(error); } 
      finally { setUcitavamPodatke(false); }
    };

    fetchProfile();
  }, [tipProfila, pretrazeniKorisnik]);

  const userProfile = {
    username: mojProfil.username || pretrazeniKorisnik?.username || '',
    fullName: mojProfil.fullName || pretrazeniKorisnik?.fullName || '',
    bio: mojProfil.bio,
    followers: mojProfil.followersCount, 
    following: mojProfil.followingCount,
    posts: userPostsData.length,
    avatar: mojProfil.avatar || pretrazeniKorisnik?.avatar || ''
  };

  const azurirajLokalnuObjavu = (azuriranaObjava) => {
    setOdabranaObjava(azuriranaObjava);
    setUserPostsData(prev => prev.map(p => p.id === azuriranaObjava.id ? azuriranaObjava : p));
  };

  const obrisiSlikuIzObjave = async (mediaId) => {
    if(!window.confirm("Da li ste sigurni da želite da obrišete ovaj fajl iz objave?")) return;
    const token = localStorage.getItem('token');
    const myId = getMyUserId();

    try {
      const res = await fetch(`http://localhost:4000/api/posts/${odabranaObjava.id}/media/${mediaId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}`, 'x-user-id': String(myId) }
      });
      if(res.ok) {
        if (odabranaObjava.media.length === 1) {
          setUserPostsData(prev => prev.filter(p => p.id !== odabranaObjava.id));
          zatvoriObjavu();
        } else {
          const novaMedia = odabranaObjava.media.filter(m => m.id !== mediaId);
          azurirajLokalnuObjavu({ ...odabranaObjava, media: novaMedia });
          if (trenutnaSlikaIndex >= novaMedia.length) {
            setTrenutnaSlikaIndex(novaMedia.length - 1);
          }
        }
      }
    } catch(err) { console.error("Greška pri brisanju medije:", err); }
  };

  const dodajKomentar = async () => {
    if (!noviKomentar.trim()) return;
    const token = localStorage.getItem('token');
    const myId = getMyUserId();

    try {
      const res = await fetch(`http://localhost:4000/api/interactions/posts/${odabranaObjava.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'x-user-id': String(myId) },
        body: JSON.stringify({ content: noviKomentar })
      });
      if (res.ok) {
        const data = await res.json();
        const noviKomObj = { 
          id: data.id, 
          userId: myId, 
          content: noviKomentar, 
          createdAt: new Date().toISOString(),
          username: userProfile.username,
          avatar: userProfile.avatar
        };
        azurirajLokalnuObjavu({
          ...odabranaObjava,
          comments: [noviKomObj, ...(odabranaObjava.comments || [])]
        });
        setNoviKomentar('');
      }
    } catch(err) { console.error(err); }
  };

  const obrisiKomentar = async (commentId) => {
    if(!window.confirm("Obriši komentar?")) return;
    const token = localStorage.getItem('token');
    const myId = getMyUserId();

    try {
      const res = await fetch(`http://localhost:4000/api/interactions/comments/${commentId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}`, 'x-user-id': String(myId) }
      });
      if(res.ok) {
        azurirajLokalnuObjavu({
          ...odabranaObjava,
          comments: odabranaObjava.comments.filter(k => k.id !== commentId)
        });
      }
    } catch(err) { console.error(err); }
  };

  const sacuvajIzmenuKomentara = async (commentId) => {
    if (!editCommentText.trim()) return;
    const token = localStorage.getItem('token');
    const myId = getMyUserId();

    try {
      const res = await fetch(`http://localhost:4000/api/interactions/comments/${commentId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'x-user-id': String(myId) },
        body: JSON.stringify({ content: editCommentText })
      });
      if(res.ok) {
        azurirajLokalnuObjavu({
          ...odabranaObjava,
          comments: odabranaObjava.comments.map(k => k.id === commentId ? { ...k, content: editCommentText } : k)
        });
        setEditCommentId(null);
        setEditCommentText('');
      }
    } catch(err) { console.error(err); }
  };

  const lajkujObjavu = async () => {
    const token = localStorage.getItem('token');
    const myId = getMyUserId();
    const vecLajkovano = odabranaObjava.isLiked;

    try {
      if (vecLajkovano) {
        const res = await fetch(`http://localhost:4000/api/interactions/posts/${odabranaObjava.id}/likes`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${token}`, 'x-user-id': String(myId) }
        });
        if (res.ok) {
          azurirajLokalnuObjavu({
            ...odabranaObjava,
            likes_count: Math.max(0, (odabranaObjava.likes_count || 0) - 1),
            isLiked: false
          });
        }
      } else {
        const res = await fetch(`http://localhost:4000/api/interactions/posts/${odabranaObjava.id}/likes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'x-user-id': String(myId) }
        });
        if (res.ok) {
          azurirajLokalnuObjavu({
            ...odabranaObjava,
            likes_count: (odabranaObjava.likes_count || 0) + 1,
            isLiked: true
          });
        }
      }
    } catch(err) { console.error(err); }
  };

  const obrisiObjavu = async () => {
    if(!window.confirm("Da li ste sigurni da želite da obrišete CELU objavu?")) return;
    const token = localStorage.getItem('token');
    const myId = getMyUserId();

    try {
      const res = await fetch(`http://localhost:4000/api/posts/${odabranaObjava.id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}`, 'x-user-id': String(myId) }
      });
      if(res.ok) {
        setUserPostsData(prev => prev.filter(p => p.id !== odabranaObjava.id));
        zatvoriObjavu();
      }
    } catch(err) { console.error("Greška pri brisanju:", err); }
  };

  const otvoriObjavu = (post) => {
    setOdabranaObjava(post);
    setTrenutnaSlikaIndex(0); 
  };

  const zatvoriObjavu = () => {
    setOdabranaObjava(null);
    setNoviKomentar('');
    setEditCommentId(null);
  };

  const fetchPratioci = async () => {
    const myUserId = getMyUserId();
    const token = localStorage.getItem('token');
    const targetId = pretrazeniKorisnik ? pretrazeniKorisnik.id : myUserId;
    if (!myUserId || !token) return;

    setUcitavamListe(true); setPrikaziPratioce(true);
    try {
      const response = await fetch(`http://localhost:4000/api/profile/users/${targetId}/followers`, {
        headers: { 'Authorization': `Bearer ${token}`, 'x-user-id': String(myUserId) }
      });
      if (response.ok) {
        const data = await response.json();
        setListaPratilaca(data.followers || []);
      }
    } catch (error) { console.error(error); } finally { setUcitavamListe(false); }
  };

  const fetchPrati = async () => {
    const myUserId = getMyUserId();
    const token = localStorage.getItem('token');
    const targetId = pretrazeniKorisnik ? pretrazeniKorisnik.id : myUserId;
    if (!myUserId || !token) return;

    setUcitavamListe(true); setPrikaziPrati(true);
    try {
      const response = await fetch(`http://localhost:4000/api/profile/users/${targetId}/following`, {
        headers: { 'Authorization': `Bearer ${token}`, 'x-user-id': String(myUserId) }
      });
      if (response.ok) {
        const data = await response.json();
        setListaPratilaca(data.following || []);
      }
    } catch (error) { console.error(error); } finally { setUcitavamListe(false); }
  };

  const handlePraviLogout = async () => {
    const token = localStorage.getItem('token');
    const refreshToken = localStorage.getItem('refreshToken');
    try {
      if (token) {
        await fetch('http://localhost:4000/api/authentication/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ refreshToken })
        });
      }
    } catch (error) { console.error(error); } 
    finally {
      localStorage.removeItem('token'); localStorage.removeItem('refreshToken'); navigate('/login');
    }
  };

  const handleFollowClick = async () => {
    const myId = getMyUserId();
    const token = localStorage.getItem('token');
    const targetId = pretrazeniKorisnik?.id || 2; 
    if (!myId || !token) return;

    try {
      if (statusPracenja === 'ne_prati') {
        await fetch('http://localhost:4000/api/follow', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'x-user-id': String(myId) },
          body: JSON.stringify({ following_id: targetId })
        });
        setStatusPracenja(tipProfila === 'privatni' ? 'poslat_zahtev' : 'prati');
      } else {
        await fetch('http://localhost:4000/api/unfollow', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'x-user-id': String(myId) },
          body: JSON.stringify({ following_id: targetId })
        });
        setStatusPracenja('ne_prati');
      }
    } catch (error) { console.error(error); }
  };

  const handleBlockClick = async () => {
    const myId = getMyUserId();
    const token = localStorage.getItem('token');
    const targetId = pretrazeniKorisnik?.id || 2;
    if (!myId || !token) return;
    try {
      if (!blokiran) {
        await fetch('http://localhost:4000/api/block', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'x-user-id': String(myId) },
          body: JSON.stringify({ blocked_id: targetId }) 
        });
        setBlokiran(true);
      } else { setBlokiran(false); }
    } catch (error) { console.error(error); }
  };

  const ukloniPratioca = async (followerId) => {
    const myId = getMyUserId();
    const token = localStorage.getItem('token');
    if(!myId || !token) return;
    try {
      const res = await fetch('http://localhost:4000/api/follow/followers/remove', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}`, 'x-user-id': String(myId) },
        body: JSON.stringify({ follower_id: followerId })
      });
      if(res.ok) {
        setListaPratilaca(listaPratilaca.filter(p => p.id !== followerId));
        setMojProfil(prev => ({...prev, followersCount: prev.followersCount - 1}));
      }
    } catch(err) { console.error(err); }
  };

  const sacuvajIzmene = async () => {
    const token = localStorage.getItem('token');
    const myId = getMyUserId();
    try {
      const response = await fetch(`http://localhost:4000/api/profile/users/me`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'x-user-id': String(myId)
        },
        body: JSON.stringify({
          first_name: tempPodaci.firstName,
          last_name: tempPodaci.lastName,
          bio: tempPodaci.bio,
          profile_image_url: tempPodaci.avatar 
        })
      });

      if (response.ok) {
        setMojProfil({ 
          ...mojProfil, 
          firstName: tempPodaci.firstName,
          lastName: tempPodaci.lastName,
          fullName: `${tempPodaci.firstName} ${tempPodaci.lastName}`, 
          bio: tempPodaci.bio,
          avatar: tempPodaci.avatar
        });
        setIsEditing(false); 
      } else {
        alert("Greška pri ažuriranju profila");
      }
    } catch (error) {
      console.error(error);
    }
  };

  const sveMojeSlike = [];
  userPostsData.forEach(post => {
    if (post.media) {
      post.media.forEach(m => {
        if (m.mediaUrl && m.mediaType === 'image') {
          sveMojeSlike.push(m.mediaUrl);
        }
      });
    }
  });

  const sledecaSlika = (e) => {
    e.stopPropagation(); 
    if (trenutnaSlikaIndex < odabranaObjava.media.length - 1) setTrenutnaSlikaIndex(trenutnaSlikaIndex + 1);
  };
  const prethodnaSlika = (e) => {
    e.stopPropagation();
    if (trenutnaSlikaIndex > 0) setTrenutnaSlikaIndex(trenutnaSlikaIndex - 1);
  };

  const mozeDaVidiSlike = tipProfila === 'moj' || tipProfila === 'javni' || (tipProfila === 'privatni' && statusPracenja === 'prati');

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h2 style={{ margin: 0, fontSize: '18px' }}>{ucitavamPodatke ? "Učitavanje..." : userProfile.username}</h2>
      </div>

      <div style={profileInfoStyle}>
        {userProfile.avatar ? ( <img src={userProfile.avatar} alt="Avatar" style={avatarStyle} /> ) : ( <div style={{...avatarStyle, backgroundColor: '#efefef', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999'}}>Nema</div> )}
        <div style={statsContainerStyle}>
          <div style={statItemStyle}>
            <strong>{mozeDaVidiSlike ? userPostsData.length : 0}</strong><span style={statLabelStyle}>objava</span>
          </div>
          <div style={{...statItemStyle, cursor: 'pointer'}} onClick={() => mozeDaVidiSlike && fetchPratioci()}>
            <strong>{userProfile.followers}</strong><span style={statLabelStyle}>pratilaca</span>
          </div>
          <div style={{...statItemStyle, cursor: 'pointer'}} onClick={() => mozeDaVidiSlike && fetchPrati()}>
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
            <button onClick={() => { 
              setTempPodaci({
                firstName: mojProfil.firstName,
                lastName: mojProfil.lastName,
                bio: mojProfil.bio,
                avatar: mojProfil.avatar
              }); 
              setIsEditing(true); 
            }} style={editButtonStyle}>Uredi profil</button>
            <button onClick={handlePraviLogout} style={{...editButtonStyle, marginLeft: '5px', backgroundColor: '#efefef', color: 'red'}}>Odjavi se</button>
          </>
        ) : (
          <>
            <button onClick={handleFollowClick} style={statusPracenja === 'ne_prati' ? followButtonStyle : followingButtonStyle}>
              {statusPracenja === 'ne_prati' ? 'Zaprati' : (statusPracenja === 'poslat_zahtev' ? 'Zahtev poslat' : 'Praćenje')}
            </button>
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
              {post.media && post.media[0] && post.media[0].mediaType === 'video' ? (
                <>
                  <video src={post.media[0].mediaUrl} style={gridImageStyle} muted playsInline />
                  <span style={{...carouselIconStyle, top: '50%', left: '50%', transform: 'translate(-50%, -50%)', fontSize: '30px'}}>▶</span>
                </>
              ) : (
                <img src={post.media && post.media[0] ? post.media[0].mediaUrl : ''} alt={`Post ${post.id}`} style={gridImageStyle} />
              )}
              {post.media && post.media.length > 1 && <span style={carouselIconStyle}>❏</span>}
            </div>
          ))}
        </div>
      )}

      {/* ─── MODAL ZA OBJAVU ─── */}
      {odabranaObjava && (
        <div style={modalOverlayStyle} onClick={zatvoriObjavu}>
          <button onClick={zatvoriObjavu} style={closeBtnStyleModal}>✕</button>
          
          <div style={postModalSplitStyle} onClick={(e) => e.stopPropagation()}>
            <div style={postLeftStyle}>
              {tipProfila === 'moj' && odabranaObjava.media && odabranaObjava.media.length > 0 && (
                <button 
                  onClick={() => obrisiSlikuIzObjave(odabranaObjava.media[trenutnaSlikaIndex].id)} 
                  style={deleteMediaBtnStyle} 
                  title="Obriši ovaj fajl"
                >
                  🗑️
                </button>
              )}

              {trenutnaSlikaIndex > 0 && <button onClick={prethodnaSlika} style={leftArrowStyle}>&#8249;</button>}
              
              {odabranaObjava.media && odabranaObjava.media[trenutnaSlikaIndex]?.mediaType === 'video' ? (
                 <video 
                   src={odabranaObjava.media[trenutnaSlikaIndex]?.mediaUrl} 
                   style={postModalImageStyle} 
                   controls 
                   autoPlay 
                 />
              ) : (
                 <img 
                   src={odabranaObjava.media && odabranaObjava.media[trenutnaSlikaIndex]?.mediaUrl} 
                   alt="Objava" 
                   style={postModalImageStyle} 
                 />
              )}

              {trenutnaSlikaIndex < (odabranaObjava.media?.length || 1) - 1 && <button onClick={sledecaSlika} style={rightArrowStyle}>&#8250;</button>}
              
              {odabranaObjava.media && odabranaObjava.media.length > 1 && (
                <div style={dotsContainerStyle}>
                  {odabranaObjava.media.map((_, idx) => (
                    <span key={idx} style={{...dotStyle, opacity: idx === trenutnaSlikaIndex ? 1 : 0.5}}>•</span>
                  ))}
                </div>
              )}
            </div>

            <div style={postRightStyle}>
              <div style={postRightHeaderStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <img src={userProfile.avatar || "/slike/outfit.jpg"} alt="avatar" style={{width: '30px', height: '30px', borderRadius: '50%'}}/>
                  <strong style={{fontSize: '14px'}}>{userProfile.username}</strong>
                </div>
                {tipProfila === 'moj' && (
                  <button onClick={obrisiObjavu} style={{background:'none', border:'none', color:'red', cursor:'pointer', fontSize: '18px'}} title="Obriši CELU objavu">🗑️</button>
                )}
              </div>

              <div style={postCommentsAreaStyle}>
                {odabranaObjava.caption && (
                  <div style={{marginBottom: '15px'}}>
                    <strong>{userProfile.username}</strong> <span style={{fontSize:'14px'}}>{odabranaObjava.caption}</span>
                  </div>
                )}
                
                {(!odabranaObjava.comments || odabranaObjava.comments.length === 0) ? (
                   <p style={{color:'gray', fontSize:'12px', textAlign:'center'}}>Nema komentara. Budi prvi!</p> 
                ) : (
                  odabranaObjava.comments.map(kom => (
                    <div key={kom.id} style={{marginBottom: '15px', fontSize: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <img 
                          src={kom.avatar || "/slike/outfit.jpg"} 
                          alt="avatar" 
                          style={{width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover', marginTop: '2px'}}
                        />
                        <div>
                          <strong>{kom.username || `Korisnik #${kom.userId}`}</strong> 
                          {editCommentId === kom.id ? (
                            <div style={{display: 'flex', gap: '5px', marginTop: '5px'}}>
                              <input 
                                type="text" 
                                value={editCommentText} 
                                onChange={(e) => setEditCommentText(e.target.value)} 
                                style={{border: '1px solid #dbdbdb', borderRadius: '3px', padding: '4px'}}
                              />
                              <button onClick={() => sacuvajIzmenuKomentara(kom.id)} style={{background: 'none', color: '#0095f6', border: 'none', cursor: 'pointer', fontWeight: 'bold'}}>Sačuvaj</button>
                              <button onClick={() => {setEditCommentId(null); setEditCommentText('');}} style={{background: 'none', border: 'none', cursor: 'pointer'}}>✕</button>
                            </div>
                          ) : (
                            <span style={{marginLeft: '5px'}}>{kom.content}</span>
                          )}
                        </div>
                      </div>

                      {kom.userId === getMyUserId() && editCommentId !== kom.id && (
                        <div style={{display: 'flex', gap: '8px', paddingTop: '2px'}}>
                          <button onClick={() => {setEditCommentId(kom.id); setEditCommentText(kom.content);}} style={{background:'none', border:'none', cursor:'pointer', fontSize:'12px'}} title="Uredi">✏️</button>
                          <button onClick={() => obrisiKomentar(kom.id)} style={{background:'none', border:'none', cursor:'pointer', fontSize:'12px'}} title="Obriši">🗑️</button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              
              <div style={postRightFooterStyle}>
                <div style={{ marginBottom: '10px', fontSize: '24px', display: 'flex', alignItems: 'center' }}>
                  <span onClick={lajkujObjavu} style={{ cursor: 'pointer', marginRight: '15px', userSelect: 'none', color: odabranaObjava.isLiked ? '#ed4956' : '#262626' }}>
                    {odabranaObjava.isLiked ? '♥' : '♡'}
                  </span>
                  <span style={{ cursor: 'default', userSelect: 'none', fontSize: '20px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    💬 <span style={{ fontSize: '16px' }}>{odabranaObjava.comments?.length || 0}</span>
                  </span>
                </div>

                <div style={{ marginBottom: '10px' }}>
                  <strong style={{ fontSize: '14px' }}>{odabranaObjava.likes_count || 0} lajkova</strong>
                </div>

                <div style={{display:'flex', borderTop:'1px solid #efefef', paddingTop:'10px'}}>
                  <input 
                    type="text" 
                    placeholder="Dodaj komentar..." 
                    value={noviKomentar} 
                    onChange={e => setNoviKomentar(e.target.value)}
                    style={{flex:1, border:'none', outline:'none', fontSize: '14px'}}
                  />
                  <button onClick={dodajKomentar} style={{background:'none', border:'none', color:'#0095f6', fontWeight:'bold', cursor:'pointer'}}>Objavi</button>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {isEditing && (
        <div style={modalOverlayStyle}>
          <div style={modalContentStyle}>
            <h3 style={{ marginTop: 0 }}>Uredi profil</h3>

            <label style={labelStyle}>Izaberi profilnu sliku iz svojih objava:</label>
            <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', padding: '10px 0', marginBottom: '10px' }}>
              {sveMojeSlike.map((url, idx) => (
                 <img 
                   key={idx} 
                   src={url} 
                   alt="izbor" 
                   onClick={() => setTempPodaci({...tempPodaci, avatar: url})}
                   style={{ 
                     width: '60px', 
                     height: '60px', 
                     objectFit: 'cover', 
                     cursor: 'pointer',
                     border: tempPodaci.avatar === url ? '3px solid #0095f6' : '1px solid #dbdbdb',
                     borderRadius: '5px'
                   }} 
                 />
              ))}
              {sveMojeSlike.length === 0 && <p style={{fontSize: '12px', color: 'gray'}}>Nemate još nijednu sliku na profilu.</p>}
            </div>

            <label style={labelStyle}>Ime</label>
            <input type="text" value={tempPodaci.firstName} onChange={(e) => setTempPodaci({...tempPodaci, firstName: e.target.value})} style={inputStyle} />
            <label style={labelStyle}>Prezime</label>
            <input type="text" value={tempPodaci.lastName} onChange={(e) => setTempPodaci({...tempPodaci, lastName: e.target.value})} style={inputStyle} />
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
              {ucitavamListe ? <p style={{textAlign:'center', color:'gray'}}>Učitavanje...</p> : listaPratilaca.length === 0 ? <p style={{textAlign:'center', color:'gray'}}>Nema pratilaca</p> : listaPratilaca.map(korisnik => (
                <div key={korisnik.id} style={userRowStyle}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <img src={korisnik.profile_image_url || "/slike/outfit.jpg"} alt="avatar" style={listAvatarStyle} />
                    <div>
                      <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{korisnik.username}</div>
                      <div style={{ color: 'gray', fontSize: '14px' }}>{korisnik.first_name} {korisnik.last_name}</div>
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
               {ucitavamListe ? <p style={{textAlign:'center', color:'gray'}}>Učitavanje...</p> : listaPratilaca.length === 0 ? <p style={{textAlign:'center', color:'gray'}}>Ne prati nikoga</p> : listaPratilaca.map(korisnik => (
                <div key={korisnik.id} style={userRowStyle}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <img src={korisnik.profile_image_url || "/slike/outfit.jpg"} alt="avatar" style={listAvatarStyle} />
                    <div>
                      <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{korisnik.username}</div>
                      <div style={{ color: 'gray', fontSize: '14px' }}>{korisnik.first_name} {korisnik.last_name}</div>
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

// STILOVI
const containerStyle = { backgroundColor: '#fafafa', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' };
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

const modalOverlayStyle = { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000 };
const closeBtnStyleModal = { position: 'absolute', top: '15px', right: '20px', background: 'none', border: 'none', color: 'white', fontSize: '30px', cursor: 'pointer', zIndex: 2001 };
const postModalSplitStyle = { display: 'flex', flexDirection: 'row', width: '90%', maxWidth: '1000px', height: '80vh', backgroundColor: 'white', borderRadius: '4px', overflow: 'hidden' };
const postLeftStyle = { flex: 2, backgroundColor: 'black', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' };
const postRightStyle = { flex: 1, display: 'flex', flexDirection: 'column', minWidth: '300px', backgroundColor: 'white' };
const postModalImageStyle = { width: '100%', height: '100%', objectFit: 'contain' };
const arrowBase = { position: 'absolute', top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.7)', border: 'none', borderRadius: '50%', width: '30px', height: '30px', fontSize: '20px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center' };
const leftArrowStyle = { ...arrowBase, left: '10px' };
const rightArrowStyle = { ...arrowBase, right: '10px' };
const dotsContainerStyle = { position: 'absolute', bottom: '15px', display: 'flex', justifyContent: 'center', gap: '5px', width: '100%' };
const dotStyle = { color: 'white', fontSize: '20px', textShadow: '0 0 3px black' };
const postRightHeaderStyle = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', borderBottom: '1px solid #efefef' };
const postCommentsAreaStyle = { flex: 1, padding: '15px', overflowY: 'auto' };
const postRightFooterStyle = { padding: '15px', borderTop: '1px solid #efefef' };
// Stil za kantu
const deleteMediaBtnStyle = {
  position: 'absolute',
  top: '15px',
  left: '15px',
  background: 'rgba(0,0,0,0.6)',
  border: 'none',
  color: 'white',
  fontSize: '16px',
  cursor: 'pointer',
  padding: '5px 10px',
  borderRadius: '5px',
  zIndex: 10
};

export default Profile;