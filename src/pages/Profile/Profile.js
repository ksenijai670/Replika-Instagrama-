import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

function Profile() {
  const navigate = useNavigate();
  const location = useLocation();
  const [pretrazeniKorisnik] = useState(location.state?.korisnik || null);

  const getToken = () => localStorage.getItem('token');
  const getMyUserId = useCallback(() => {
    const token = getToken();
    if (!token) return null;
    try { return JSON.parse(atob(token.split('.')[1])).userId; }
    catch { return null; }
  }, []);
  const myId = getMyUserId();

  const [tipProfila, setTipProfila] = useState(() => {
    if (pretrazeniKorisnik && Number(pretrazeniKorisnik.id) !== Number(myId)) return 'javni';
    return 'moj';
  });

  const [statusPracenja, setStatusPracenja] = useState('ne_prati');
  const [isEditing, setIsEditing] = useState(false);
  const [blokiran, setBlokiran] = useState(false);

  const [prikaziPratioce, setPrikaziPratioce] = useState(false);
  const [prikaziPrati, setPrikaziPrati] = useState(false);
  const [prikaziBlokirane, setPrikaziBlokirane] = useState(false);
  const [listaBlokiranih, setListaBlokiranih] = useState([]);

  const [odabranaObjava, setOdabranaObjava] = useState(null);
  const [trenutnaSlikaIndex, setTrenutnaSlikaIndex] = useState(0);
  const [noviKomentar, setNoviKomentar] = useState('');
  const [editCommentId, setEditCommentId] = useState(null);
  const [editCommentText, setEditCommentText] = useState('');
  const [editCaption, setEditCaption] = useState(false);
  const [noviCaption, setNoviCaption] = useState('');

  const [ucitavamPodatke, setUcitavamPodatke] = useState(false);
  const [ucitavamListe, setUcitavamListe] = useState(false);

  const [mojProfil, setMojProfil] = useState({
    username: '', firstName: '', lastName: '', bio: '', avatar: '',
    followersCount: 0, followingCount: 0, isPrivate: false
  });
  const [listaPratilaca, setListaPratilaca] = useState([]);
  const [userPostsData, setUserPostsData] = useState([]);
  const [tempPodaci, setTempPodaci] = useState({ firstName: '', lastName: '', bio: '', avatar: '', isPrivate: false });
  const avatarInputRef = useRef(null);

  const authHeaders = useCallback((extra = {}) => ({
    'Authorization': `Bearer ${getToken()}`,
    'x-user-id': String(myId),
    ...extra
  }), [myId]);

  const fetchLikeStatuses = useCallback(async (posts) => {
    if (!posts || posts.length === 0) return;
    const token = getToken();
    if (!token || !myId) return;
    try {
      const statuses = await Promise.all(
        posts.map(post =>
          fetch(`http://localhost:4000/api/interactions/posts/${post.id}/likes/status`, {
            headers: { 'Authorization': `Bearer ${token}`, 'x-user-id': String(myId) }
          })
          .then(r => r.ok ? r.json() : { isLiked: false })
          .then(data => ({ postId: post.id, isLiked: !!data.isLiked }))
          .catch(() => ({ postId: post.id, isLiked: false }))
        )
      );
      const likeMap = {};
      statuses.forEach(({ postId, isLiked }) => { likeMap[postId] = isLiked; });
      setUserPostsData(prev => prev.map(p => ({ ...p, isLiked: likeMap[p.id] ?? p.isLiked ?? false })));
    } catch (err) { console.error('[fetchLikeStatuses]', err); }
  }, [myId]);

  const fetchProfile = useCallback(async () => {
    const token = getToken();
    if (!myId || !token) return;
    const targetId = pretrazeniKorisnik ? pretrazeniKorisnik.id : myId;
    setUcitavamPodatke(true);
    try {
      const res = await fetch(`http://localhost:4000/api/profile/users/${targetId}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'x-user-id': String(myId) }
      });
      if (res.ok) {
        const { user } = await res.json();
        setMojProfil({
          username:       user.username          || '',
          firstName:      user.first_name        || '',
          lastName:       user.last_name         || '',
          bio:            user.bio               || '',
          avatar:         user.profile_image_url || '',
          followersCount: user.followers_count   || 0,
          followingCount: user.following_count   || 0,
          isPrivate:      !!user.is_private,
        });
        const posts = user.posts || [];
        setUserPostsData(posts);
        fetchLikeStatuses(posts);

        if (Number(targetId) === Number(myId)) {
          setTipProfila('moj');
        } else if (pretrazeniKorisnik) {
          setTipProfila(user.is_private ? 'privatni' : 'javni');
        }

        if (user.is_following) setStatusPracenja('prati');
      }
    } catch (err) { console.error(err); }
    finally { setUcitavamPodatke(false); }
  }, [myId, pretrazeniKorisnik, fetchLikeStatuses]);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  const fullName = `${mojProfil.firstName} ${mojProfil.lastName}`.trim();
  const userProfile = {
    username:  mojProfil.username  || pretrazeniKorisnik?.username || '',
    fullName:  fullName            || pretrazeniKorisnik?.fullName || '',
    bio:       mojProfil.bio,
    followers: mojProfil.followersCount,
    following: mojProfil.followingCount,
    posts:     userPostsData.length,
    avatar:    mojProfil.avatar    || pretrazeniKorisnik?.avatar   || ''
  };

  const sveMojeSlike = userPostsData.flatMap(post =>
    (post.media || []).filter(m => m.mediaUrl && m.mediaType === 'image').map(m => m.mediaUrl)
  );
  const mozeDaVidiSlike = tipProfila === 'moj' || tipProfila === 'javni' || (tipProfila === 'privatni' && statusPracenja === 'prati');

  const azurirajLokalnuObjavu = (azuriranaObjava) => {
    setOdabranaObjava(azuriranaObjava);
    setUserPostsData(prev => prev.map(p => p.id === azuriranaObjava.id ? azuriranaObjava : p));
  };

  const obrisiSlikuIzObjave = async (mediaId) => {
    if (!window.confirm("Da li ste sigurni da želite da obrišete ovaj fajl iz objave?")) return;
    try {
      const res = await fetch(`http://localhost:4000/api/posts/${odabranaObjava.id}/media/${mediaId}`, {
        method: 'DELETE', headers: authHeaders()
      });
      if (res.ok) {
        if (odabranaObjava.media.length === 1) {
          setUserPostsData(prev => prev.filter(p => p.id !== odabranaObjava.id));
          zatvoriObjavu();
        } else {
          const novaMedia = odabranaObjava.media.filter(m => m.id !== mediaId);
          azurirajLokalnuObjavu({ ...odabranaObjava, media: novaMedia });
          if (trenutnaSlikaIndex >= novaMedia.length) setTrenutnaSlikaIndex(novaMedia.length - 1);
        }
      }
    } catch (err) { console.error(err); }
  };

  const dodajKomentar = async () => {
    if (!noviKomentar.trim()) return;
    try {
      const res = await fetch(`http://localhost:4000/api/interactions/posts/${odabranaObjava.id}/comments`, {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ content: noviKomentar })
      });
      if (res.ok) {
        const data = await res.json();
        azurirajLokalnuObjavu({
          ...odabranaObjava,
          comments: [{
            id: data.id, userId: myId, content: noviKomentar,
            createdAt: new Date().toISOString(),
            username: userProfile.username,
            firstName: mojProfil.firstName,
            lastName: mojProfil.lastName,
            avatar: userProfile.avatar
          }, ...(odabranaObjava.comments || [])]
        });
        setNoviKomentar('');
      }
    } catch (err) { console.error(err); }
  };

  const obrisiKomentar = async (commentId) => {
    if (!window.confirm("Obriši komentar?")) return;
    try {
      const res = await fetch(`http://localhost:4000/api/interactions/comments/${commentId}`, {
        method: 'DELETE', headers: authHeaders()
      });
      if (res.ok) azurirajLokalnuObjavu({ ...odabranaObjava, comments: odabranaObjava.comments.filter(k => k.id !== commentId) });
    } catch (err) { console.error(err); }
  };

  const sacuvajIzmenuKomentara = async (commentId) => {
    if (!editCommentText.trim()) return;
    try {
      const res = await fetch(`http://localhost:4000/api/interactions/comments/${commentId}`, {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ content: editCommentText })
      });
      if (res.ok) {
        azurirajLokalnuObjavu({ ...odabranaObjava, comments: odabranaObjava.comments.map(k => k.id === commentId ? { ...k, content: editCommentText } : k) });
        setEditCommentId(null); setEditCommentText('');
      }
    } catch (err) { console.error(err); }
  };

  const lajkujObjavu = async () => {
    const vecLajkovano = odabranaObjava.isLiked;
    try {
      const res = await fetch(`http://localhost:4000/api/interactions/posts/${odabranaObjava.id}/likes`, {
        method: vecLajkovano ? 'DELETE' : 'POST',
        headers: authHeaders(vecLajkovano ? {} : { 'Content-Type': 'application/json' })
      });
      if (res.ok) azurirajLokalnuObjavu({
        ...odabranaObjava,
        likes_count: vecLajkovano ? Math.max(0, (odabranaObjava.likes_count || 0) - 1) : (odabranaObjava.likes_count || 0) + 1,
        isLiked: !vecLajkovano
      });
    } catch (err) { console.error(err); }
  };

  const obrisiObjavu = async () => {
    if (!window.confirm("Da li ste sigurni da želite da obrišete CELU objavu?")) return;
    try {
      const res = await fetch(`http://localhost:4000/api/posts/${odabranaObjava.id}`, {
        method: 'DELETE', headers: authHeaders()
      });
      if (res.ok) { setUserPostsData(prev => prev.filter(p => p.id !== odabranaObjava.id)); zatvoriObjavu(); }
    } catch (err) { console.error(err); }
  };

  const sacuvajCaption = async () => {
    if (!noviCaption.trim() && noviCaption !== '') return;
    try {
      const res = await fetch(`http://localhost:4000/api/posts/${odabranaObjava.id}/caption`, {
        method: 'PUT',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ caption: noviCaption })
      });
      if (res.ok) {
        azurirajLokalnuObjavu({ ...odabranaObjava, caption: noviCaption });
        setEditCaption(false);
        setNoviCaption('');
      }
    } catch (err) { console.error(err); }
  };

  const otvoriObjavu = (post) => { setOdabranaObjava(post); setTrenutnaSlikaIndex(0); };
  const zatvoriObjavu = () => { setOdabranaObjava(null); setNoviKomentar(''); setEditCommentId(null); setEditCaption(false); setNoviCaption(''); };
  const sledecaSlika = (e) => { e.stopPropagation(); if (trenutnaSlikaIndex < odabranaObjava.media.length - 1) setTrenutnaSlikaIndex(i => i + 1); };
  const prethodnaSlika = (e) => { e.stopPropagation(); if (trenutnaSlikaIndex > 0) setTrenutnaSlikaIndex(i => i - 1); };

  const otvoriProfil = (korisnik) => {
    navigate('/profile', { state: { korisnik: {
      id: korisnik.id,
      username: korisnik.username,
      fullName: `${korisnik.first_name || ''} ${korisnik.last_name || ''}`.trim(),
      avatar: korisnik.profile_image_url || ''
    }}});
    window.location.reload();
  };

  const fetchPratioci = async () => {
    const targetId = pretrazeniKorisnik ? pretrazeniKorisnik.id : myId;
    setUcitavamListe(true); setPrikaziPratioce(true);
    try {
      const res = await fetch(`http://localhost:4000/api/profile/users/${targetId}/followers`, { headers: authHeaders() });
      if (res.ok) { const data = await res.json(); setListaPratilaca(data.followers || []); }
    } catch (err) { console.error(err); } finally { setUcitavamListe(false); }
  };

  const fetchPrati = async () => {
    const targetId = pretrazeniKorisnik ? pretrazeniKorisnik.id : myId;
    setUcitavamListe(true); setPrikaziPrati(true);
    try {
      const res = await fetch(`http://localhost:4000/api/profile/users/${targetId}/following`, { headers: authHeaders() });
      if (res.ok) { const data = await res.json(); setListaPratilaca(data.following || []); }
    } catch (err) { console.error(err); } finally { setUcitavamListe(false); }
  };

  const fetchBlokirane = async () => {
    setPrikaziBlokirane(true);
    try {
      // Uzmi listu blokiranih ID-jeva
      const res = await fetch('http://localhost:4000/api/block/blocked-list', { headers: authHeaders() });
      if (!res.ok) return;
      const data = await res.json();
      const blockedIds = (data.blocked || []).map(b => b.id);

      if (blockedIds.length === 0) {
        setListaBlokiranih([]);
        return;
      }

      // Uzmi podatke direktno iz profile servisa zaobilazeći blok proveru
      const profileRes = await fetch('http://localhost:4000/api/profile/users/by-ids', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ ids: blockedIds })
      });

      if (profileRes.ok) {
        const profileData = await profileRes.json();
        setListaBlokiranih(profileData.users || []);
      }
    } catch (err) { console.error(err); }
  };

  const odblokirajKorisnika = async (blockedId) => {
    try {
      const res = await fetch('http://localhost:4000/api/block/unblock', {
        method: 'DELETE',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ blocked_id: blockedId })
      });
      if (res.ok) setListaBlokiranih(prev => prev.filter(b => b.id !== blockedId));
    } catch (err) { console.error(err); }
  };

  const handlePraviLogout = async () => {
    const token = getToken();
    const refreshToken = localStorage.getItem('refreshToken');
    try {
      if (token) await fetch('http://localhost:4000/api/authentication/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ refreshToken })
      });
    } catch (err) { console.error(err); }
    finally { localStorage.removeItem('token'); localStorage.removeItem('refreshToken'); navigate('/login'); }
  };

  const handleFollowClick = async () => {
    if (!myId || !pretrazeniKorisnik?.id) return;
    try {
      if (statusPracenja === 'ne_prati') {
        await fetch('http://localhost:4000/api/follow', {
          method: 'POST',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ following_id: pretrazeniKorisnik.id })
        });
        setStatusPracenja(tipProfila === 'privatni' ? 'poslat_zahtev' : 'prati');
      } else {
        await fetch('http://localhost:4000/api/unfollow', {
          method: 'DELETE',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ following_id: pretrazeniKorisnik.id })
        });
        setStatusPracenja('ne_prati');
      }
    } catch (err) { console.error(err); }
  };

  const handleBlockClick = async () => {
    if (!myId || !pretrazeniKorisnik?.id) return;
    try {
      if (!blokiran) {
        await fetch('http://localhost:4000/api/block', {
          method: 'POST',
          headers: authHeaders({ 'Content-Type': 'application/json' }),
          body: JSON.stringify({ blocked_id: pretrazeniKorisnik.id })
        });
        setBlokiran(true);
      } else { setBlokiran(false); }
    } catch (err) { console.error(err); }
  };

  const uploadAvatarSliku = async (file) => {
    if (!file) return null;
    const formData = new FormData();
    formData.append('avatar', file);
    try {
      const res = await fetch('http://localhost:4000/api/profile/avatar', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${getToken()}`, 'x-user-id': String(myId) },
        body: formData
      });
      if (res.ok) {
        const data = await res.json();
        return data.url || null;
      }
    } catch (err) { console.error(err); }
    return null;
  };

  const sacuvajIzmene = async () => {
    try {
      let noviAvatar = tempPodaci.avatar;
      if (tempPodaci.avatarFile) {
        const uploadovaniUrl = await uploadAvatarSliku(tempPodaci.avatarFile);
        if (uploadovaniUrl) noviAvatar = uploadovaniUrl;
      }
      const res = await fetch('http://localhost:4000/api/authentication/me', {
        method: 'PATCH',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          firstName:       tempPodaci.firstName,
          lastName:        tempPodaci.lastName,
          bio:             tempPodaci.bio,
          profileImageUrl: noviAvatar,
          isPrivate:       tempPodaci.isPrivate,
        })
      });
      if (res.ok) {
        setMojProfil(prev => ({
          ...prev,
          firstName: tempPodaci.firstName,
          lastName:  tempPodaci.lastName,
          bio:       tempPodaci.bio,
          avatar:    noviAvatar,
          isPrivate: tempPodaci.isPrivate,
        }));
        setIsEditing(false);
      } else {
        alert("Greška pri ažuriranju profila");
      }
    } catch (err) { console.error(err); }
  };

  return (
    <div style={S.container}>
      <div style={S.header}>
        <h2 style={{ margin: 0, fontSize: '18px' }}>{ucitavamPodatke ? "Učitavanje..." : userProfile.username}</h2>
      </div>

      <div style={S.profileInfo}>
        {userProfile.avatar
          ? <img src={userProfile.avatar} alt="Avatar" style={S.avatar} />
          : <div style={{...S.avatar, backgroundColor: '#efefef', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999'}}>Nema</div>
        }
        <div style={S.statsContainer}>
          <div style={S.statItem}>
            <strong>{mozeDaVidiSlike ? userPostsData.length : 0}</strong>
            <span style={S.statLabel}>objava</span>
          </div>
          <div style={{...S.statItem, cursor: 'pointer'}} onClick={() => mozeDaVidiSlike && fetchPratioci()}>
            <strong>{userProfile.followers}</strong>
            <span style={S.statLabel}>pratilaca</span>
          </div>
          <div style={{...S.statItem, cursor: 'pointer'}} onClick={() => mozeDaVidiSlike && fetchPrati()}>
            <strong>{userProfile.following}</strong>
            <span style={S.statLabel}>prati</span>
          </div>
        </div>
      </div>

      <div style={S.bio}>
        <strong>{userProfile.fullName}</strong>
        <p style={{ margin: '5px 0' }}>{userProfile.bio}</p>
      </div>

      <div style={S.actionButton}>
        {tipProfila === 'moj' ? (
          <>
            <button onClick={() => { setTempPodaci({ firstName: mojProfil.firstName, lastName: mojProfil.lastName, bio: mojProfil.bio, avatar: mojProfil.avatar, isPrivate: mojProfil.isPrivate, avatarFile: null }); setIsEditing(true); }} style={S.editButton}>Uredi profil</button>
            <button onClick={handlePraviLogout} style={{...S.editButton, marginLeft: '5px', backgroundColor: '#efefef', color: 'red'}}>Odjavi se</button>
            <button onClick={fetchBlokirane} style={{...S.editButton, marginLeft: '5px'}}>Blokirani</button>
          </>
        ) : (
          <>
            <button onClick={handleFollowClick} style={statusPracenja === 'ne_prati' ? S.followButton : S.followingButton}>
              {statusPracenja === 'ne_prati' ? 'Zaprati' : statusPracenja === 'poslat_zahtev' ? 'Zahtev poslat' : 'Praćenje'}
            </button>
            <button onClick={handleBlockClick} style={{...S.followingButton, marginLeft: '5px', color: blokiran ? 'white' : 'red', backgroundColor: blokiran ? 'red' : '#efefef'}}>
              {blokiran ? 'Odblokiraj' : 'Blokiraj'}
            </button>
          </>
        )}
      </div>

      {!mozeDaVidiSlike ? (
        <div style={S.privateProfile}>
          <span style={{ fontSize: '50px' }}>⊘</span>
          <h3>Ovaj profil je privatan</h3>
          <p style={{ color: 'gray', textAlign: 'center', margin: '0 20px' }}>Zaprati ovaj profil da bi video/la njegove фотографије.</p>
        </div>
      ) : (
        <div style={S.grid}>
          {userPostsData.map((post) => (
            <div key={post.id} style={S.gridItem} onClick={() => otvoriObjavu(post)}>
              {post.media?.[0]?.mediaType === 'video' ? (
                <>
                  <video src={post.media[0].mediaUrl} style={S.gridImage} muted playsInline />
                  <span style={{...S.carouselIcon, top: '50%', left: '50%', transform: 'translate(-50%, -50%)', fontSize: '30px'}}>▶</span>
                </>
              ) : (
                <img src={post.media?.[0]?.mediaUrl || ''} alt={`Post ${post.id}`} style={S.gridImage} />
              )}
              {post.media && post.media.length > 1 && <span style={S.carouselIcon}>❏</span>}
            </div>
          ))}
        </div>
      )}

      {/*MODAL ZA OBJAVU*/}
      {odabranaObjava && (
        <div style={S.modalOverlay} onClick={zatvoriObjavu}>
          <button onClick={zatvoriObjavu} style={S.closeBtnModal}>✕</button>
          <div style={S.postModalSplit} onClick={e => e.stopPropagation()}>
            <div style={S.postLeft}>
              {tipProfila === 'moj' && odabranaObjava.media?.length > 0 && (
                <button onClick={() => obrisiSlikuIzObjave(odabranaObjava.media[trenutnaSlikaIndex].id)} style={S.deleteMediaBtn} title="Obriši ovaj fajl">🗑</button>
              )}
              {trenutnaSlikaIndex > 0 && <button onClick={prethodnaSlika} style={S.leftArrow}>&#8249;</button>}
              {odabranaObjava.media?.[trenutnaSlikaIndex]?.mediaType === 'video' ? (
                <video src={odabranaObjava.media[trenutnaSlikaIndex].mediaUrl} style={S.postModalImage} controls autoPlay />
              ) : (
                <img src={odabranaObjava.media?.[trenutnaSlikaIndex]?.mediaUrl} alt="Objava" style={S.postModalImage} />
              )}
              {trenutnaSlikaIndex < (odabranaObjava.media?.length || 1) - 1 && <button onClick={sledecaSlika} style={S.rightArrow}>&#8250;</button>}
              {odabranaObjava.media?.length > 1 && (
                <div style={S.dotsContainer}>
                  {odabranaObjava.media.map((_, idx) => (
                    <span key={idx} style={{...S.dot, opacity: idx === trenutnaSlikaIndex ? 1 : 0.5}}>•</span>
                  ))}
                </div>
              )}
            </div>

            <div style={S.postRight}>
              <div style={S.postRightHeader}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <img src={userProfile.avatar || "/slike/outfit.jpg"} alt="avatar" style={{width: '30px', height: '30px', borderRadius: '50%'}}/>
                  <strong style={{fontSize: '14px'}}>{userProfile.fullName || userProfile.username}</strong>
                </div>
                {tipProfila === 'moj' && (
                  <button onClick={obrisiObjavu} style={{background:'none', border:'none', color:'red', cursor:'pointer', fontSize: '18px'}} title="Obriši CELU objavu">🗑</button>
                )}
              </div>

              <div style={S.postCommentsArea}>
                {odabranaObjava.caption !== undefined && (
                  <div style={{marginBottom: '15px'}}>
                    <strong>{userProfile.fullName || userProfile.username}</strong>{' '}
                    {tipProfila === 'moj' && editCaption ? (
                      <div style={{ display: 'flex', gap: '5px', marginTop: '5px' }}>
                        <input
                          type="text"
                          value={noviCaption}
                          onChange={e => setNoviCaption(e.target.value)}
                          style={{ flex: 1, border: '1px solid #dbdbdb', borderRadius: '3px', padding: '4px', fontSize: '14px' }}
                        />
                        <button onClick={sacuvajCaption} style={{background:'none', color:'#0095f6', border:'none', cursor:'pointer', fontWeight:'bold'}}>Sačuvaj</button>
                        <button onClick={() => { setEditCaption(false); setNoviCaption(''); }} style={{background:'none', border:'none', cursor:'pointer'}}>✕</button>
                      </div>
                    ) : (
                      <span style={{ fontSize: '14px' }}>
                        {odabranaObjava.caption}
                        {tipProfila === 'moj' && (
                          <button
                            onClick={() => { setEditCaption(true); setNoviCaption(odabranaObjava.caption || ''); }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '12px', marginLeft: '6px', color: 'gray' }}
                            title="Izmeni opis"
                          >🖋</button>
                        )}
                      </span>
                    )}
                  </div>
                )}
                {(!odabranaObjava.comments || odabranaObjava.comments.length === 0) ? (
                  <p style={{color:'gray', fontSize:'12px', textAlign:'center'}}>Nema komentara. Budi prvi!</p>
                ) : (
                  odabranaObjava.comments.map(kom => (
                    <div key={kom.id} style={{marginBottom: '15px', fontSize: '14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start'}}>
                      <div style={{ display: 'flex', gap: '10px' }}>
                        <img src={kom.avatar || "/slike/outfit.jpg"} alt="avatar" style={{width: '24px', height: '24px', borderRadius: '50%', objectFit: 'cover', marginTop: '2px'}}/>
                        <div>
                          <strong>
                            {kom.firstName && kom.lastName
                              ? `${kom.firstName} ${kom.lastName}`
                              : kom.username || `Korisnik #${kom.userId}`}
                          </strong>
                          {editCommentId === kom.id ? (
                            <div style={{display: 'flex', gap: '5px', marginTop: '5px'}}>
                              <input type="text" value={editCommentText} onChange={e => setEditCommentText(e.target.value)} style={{border: '1px solid #dbdbdb', borderRadius: '3px', padding: '4px'}}/>
                              <button onClick={() => sacuvajIzmenuKomentara(kom.id)} style={{background: 'none', color: '#0095f6', border: 'none', cursor: 'pointer', fontWeight: 'bold'}}>Sačuvaj</button>
                              <button onClick={() => { setEditCommentId(null); setEditCommentText(''); }} style={{background: 'none', border: 'none', cursor: 'pointer'}}>✕</button>
                            </div>
                          ) : (
                            <span style={{marginLeft: '5px'}}>{kom.content}</span>
                          )}
                        </div>
                      </div>
                      {/* vlasnik komentara ili vlasnik objave vidi dugmad */}
                      {(Number(kom.userId) === Number(myId) || Number(odabranaObjava.userId) === Number(myId)) && editCommentId !== kom.id && (
                        <div style={{display: 'flex', gap: '8px', paddingTop: '2px'}}>
                          {/* izmena samo za vlasnika komentara */}
                          {Number(kom.userId) === Number(myId) && (
                            <button onClick={() => { setEditCommentId(kom.id); setEditCommentText(kom.content); }}
                              style={{background:'none', border:'none', cursor:'pointer', fontSize:'12px'}} title="Uredi">🖋</button>
                          )}
                          {/* brisanje za vlasnika komentara ili vlasnika objave */}
                          <button onClick={() => obrisiKomentar(kom.id)}
                            style={{background:'none', border:'none', cursor:'pointer', fontSize:'12px'}} title="Obriši">🗑</button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              <div style={S.postRightFooter}>
                <div style={{ marginBottom: '10px', fontSize: '24px', display: 'flex', alignItems: 'center' }}>
                  <span onClick={lajkujObjavu} style={{ cursor: 'pointer', marginRight: '25px', userSelect: 'none', color: odabranaObjava.isLiked ? '#ed4956' : '#262626' }}>
                    {odabranaObjava.isLiked ? '♥' : '♡'}
                  </span>
                  <span style={{ cursor: 'default', userSelect: 'none', fontSize: '20px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                    💬 <span style={{ fontSize: '16px' }}>{odabranaObjava.comments?.length || 0}</span>
                  </span>
                </div>
                <div style={{ marginBottom: '10px' }}>
                  <strong style={{ fontSize: '14px' }}>{odabranaObjava.likes_count || 0} lajkova</strong>
                </div>
                <div style={{display:'flex', borderTop:'1px solid #dbdbdb', paddingTop:'10px'}}>
                  <input type="text" placeholder="Dodaj komentar..." value={noviKomentar} onChange={e => setNoviKomentar(e.target.value)} style={{flex:1, border:'none', outline:'none', fontSize: '14px'}}/>
                  <button onClick={dodajKomentar} style={{background:'none', border:'none', color:'#0095f6', fontWeight:'bold', cursor:'pointer'}}>Objavi</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL ZA IZMENU PROFILA */}
      {isEditing && (
        <div style={S.modalOverlay}>
          <div style={{...S.modalContent, maxHeight: '85vh', overflowY: 'auto'}}>
            <h3 style={{ marginTop: 0 }}>Uredi profil</h3>

            <label style={S.label}>Profilna slika</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', marginBottom: '10px' }}>
              <img
                src={tempPodaci.avatarPreview || tempPodaci.avatar || '/slike/outfit.jpg'}
                alt="avatar preview"
                style={{ width: '60px', height: '60px', borderRadius: '50%', objectFit: 'cover', border: '2px solid #dbdbdb' }}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                <button
                  onClick={() => avatarInputRef.current?.click()}
                  style={{...S.saveModalBtn, fontSize: '12px', padding: '6px 12px'}}>
                  Izaberi sliku
                </button>
                {(tempPodaci.avatarPreview || tempPodaci.avatar) && (
                  <button onClick={() => setTempPodaci(p => ({ ...p, avatar: '', avatarFile: null, avatarPreview: '' }))}
                    style={{...S.cancelModalBtn, fontSize: '12px', color: 'red'}}>
                    Ukloni sliku
                  </button>
                )}
              </div>
              <input
                ref={avatarInputRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={e => {
                  const file = e.target.files[0];
                  if (file) {
                    setTempPodaci(p => ({
                      ...p,
                      avatarFile: file,
                      avatarPreview: URL.createObjectURL(file)
                    }));
                  }
                }}
              />
            </div>

            <label style={S.label}>Ili izaberi iz svojih objava:</label>
            <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', padding: '10px 0', marginBottom: '10px' }}>
              {sveMojeSlike.map((url, idx) => (
                <img key={idx} src={url} alt="izbor" onClick={() => setTempPodaci(p => ({...p, avatar: url, avatarFile: null, avatarPreview: ''}))}
                  style={{ width: '60px', height: '60px', objectFit: 'cover', cursor: 'pointer', borderRadius: '5px', flexShrink: 0,
                    border: (tempPodaci.avatarPreview ? false : tempPodaci.avatar === url) ? '3px solid #0095f6' : '1px solid #dbdbdb' }}
                />
              ))}
              {sveMojeSlike.length === 0 && <p style={{fontSize: '12px', color: 'gray'}}>Nemate još nijednu sliku na profilu.</p>}
            </div>

            <label style={S.label}>Ime</label>
            <input type="text" value={tempPodaci.firstName} onChange={e => setTempPodaci({...tempPodaci, firstName: e.target.value})} style={S.input} />
            <label style={S.label}>Prezime</label>
            <input type="text" value={tempPodaci.lastName} onChange={e => setTempPodaci({...tempPodaci, lastName: e.target.value})} style={S.input} />
            <label style={S.label}>Biografija</label>
            <textarea value={tempPodaci.bio} onChange={e => setTempPodaci({...tempPodaci, bio: e.target.value})} style={S.textarea} />

            <label style={{ ...S.label, marginTop: '15px' }}>Vidljivost profila</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '5px' }}>
              <button
                onClick={() => setTempPodaci(p => ({ ...p, isPrivate: false }))}
                style={{ ...S.editButton, flex: 1, padding: '7px 0',
                  backgroundColor: !tempPodaci.isPrivate ? '#0095f6' : '#efefef',
                  color: !tempPodaci.isPrivate ? 'white' : 'black' }}
              > ꗃ Javan </button>
              <button
                onClick={() => setTempPodaci(p => ({ ...p, isPrivate: true }))}
                style={{ ...S.editButton, flex: 1, padding: '7px 0',
                  backgroundColor: tempPodaci.isPrivate ? '#0095f6' : '#efefef',
                  color: tempPodaci.isPrivate ? 'white' : 'black' }}
              > 🔒︎ Privatan </button>
            </div>

            <div style={S.modalButtonContainer}>
              <button onClick={() => setIsEditing(false)} style={S.cancelModalBtn}>Odustani</button>
              <button onClick={sacuvajIzmene} style={S.saveModalBtn}>Sačuvaj</button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL BLOKIRANI */}
      {prikaziBlokirane && (
        <div style={S.modalOverlay}>
          <div style={S.listModal}>
            <div style={S.listHeader}>
              <h3 style={{ margin: 0 }}>Blokirani korisnici</h3>
              <button onClick={() => setPrikaziBlokirane(false)} style={S.closeBtn}>✕</button>
            </div>
            <div style={S.listContainer}>
              {listaBlokiranih.length === 0
                ? <p style={{textAlign:'center', color:'gray'}}>Nema blokiranih korisnika</p>
                : listaBlokiranih.map(korisnik => (
                  <div key={korisnik.id} style={S.userRow}>
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <img src={korisnik.profile_image_url || "/slike/outfit.jpg"} alt="avatar" style={S.listAvatar} />
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{korisnik.first_name} {korisnik.last_name}</div>
                        <div style={{ color: 'gray', fontSize: '12px' }}>@{korisnik.username}</div>
                      </div>
                    </div>
                    <button onClick={() => odblokirajKorisnika(korisnik.id)} style={{...S.removeBtn, color: '#0095f6'}}>Odblokiraj</button>
                  </div>
                ))
              }
            </div>
          </div>
        </div>
      )}

      {/* MODAL PRATIOCI */}
      {prikaziPratioce && (
        <div style={S.modalOverlay}>
          <div style={S.listModal}>
            <div style={S.listHeader}>
              <h3 style={{ margin: 0 }}>Pratioci</h3>
              <button onClick={() => setPrikaziPratioce(false)} style={S.closeBtn}>✕</button>
            </div>
            <div style={S.listContainer}>
              {ucitavamListe ? <p style={{textAlign:'center', color:'gray'}}>Učitavanje...</p>
                : listaPratilaca.length === 0 ? <p style={{textAlign:'center', color:'gray'}}>Nema pratilaca</p>
                : listaPratilaca.map(korisnik => (
                  <div key={korisnik.id} style={S.userRow}>
                    <div
                      style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', flex: 1 }}
                      onClick={() => { setPrikaziPratioce(false); otvoriProfil(korisnik); }}
                    >
                      <img src={korisnik.profile_image_url || "/slike/outfit.jpg"} alt="avatar" style={S.listAvatar} />
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#262626' }}>{korisnik.first_name} {korisnik.last_name}</div>
                        <div style={{ color: 'gray', fontSize: '12px' }}>@{korisnik.username}</div>
                      </div>
                    </div>
                  </div>
                ))
              }
            </div>
          </div>
        </div>
      )}

      {/* MODAL PRATI */}
      {prikaziPrati && (
        <div style={S.modalOverlay}>
          <div style={S.listModal}>
            <div style={S.listHeader}>
              <h3 style={{ margin: 0 }}>Prati</h3>
              <button onClick={() => setPrikaziPrati(false)} style={S.closeBtn}>✕</button>
            </div>
            <div style={S.listContainer}>
              {ucitavamListe ? <p style={{textAlign:'center', color:'gray'}}>Učitavanje...</p>
                : listaPratilaca.length === 0 ? <p style={{textAlign:'center', color:'gray'}}>Ne prati nikoga</p>
                : listaPratilaca.map(korisnik => (
                  <div
                    key={korisnik.id}
                    style={{ ...S.userRow, cursor: 'pointer' }}
                    onClick={() => { setPrikaziPrati(false); otvoriProfil(korisnik); }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <img src={korisnik.profile_image_url || "/slike/outfit.jpg"} alt="avatar" style={S.listAvatar} />
                      <div>
                        <div style={{ fontWeight: 'bold', fontSize: '14px', color: '#262626' }}>{korisnik.first_name} {korisnik.last_name}</div>
                        <div style={{ color: 'gray', fontSize: '12px' }}>@{korisnik.username}</div>
                      </div>
                    </div>
                  </div>
                ))
              }
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// STILOVI 
const S = {
  container:            { backgroundColor: '#fafafa', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' },
  header:               { width: '100%', maxWidth: '470px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', backgroundColor: 'white', borderBottom: '1px solid #dbdbdb' },
  profileInfo:          { width: '100%', maxWidth: '470px', display: 'flex', alignItems: 'center', padding: '20px 15px', backgroundColor: 'white' },
  avatar:               { width: '80px', height: '80px', borderRadius: '50%', objectFit: 'cover', border: '1px solid #dbdbdb' },
  statsContainer:       { flex: 1, display: 'flex', justifyContent: 'space-around', marginLeft: '20px' },
  statItem:             { display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: '16px' },
  statLabel:            { fontSize: '14px', color: 'gray' },
  bio:                  { width: '100%', maxWidth: '470px', padding: '0 15px 15px 15px', backgroundColor: 'white', fontSize: '14px' },
  actionButton:         { width: '100%', maxWidth: '470px', display: 'flex', justifyContent: 'center', padding: '0 15px 20px 15px', backgroundColor: 'white', gap: '5px' },
  editButton:           { width: '100%', padding: '7px 0', backgroundColor: '#efefef', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', flex: 1 },
  followButton:         { width: '100%', padding: '7px 0', backgroundColor: '#0095f6', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', flex: 1 },
  followingButton:      { width: '100%', padding: '7px 0', backgroundColor: '#efefef', color: 'black', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', flex: 1 },
  grid:                 { width: '100%', maxWidth: '470px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '2px', backgroundColor: 'white', borderTop: '1px solid #dbdbdb', paddingTop: '2px', paddingBottom: '70px' },
  gridItem:             { width: '100%', aspectRatio: '1 / 1', cursor: 'pointer', position: 'relative' },
  gridImage:            { width: '100%', height: '100%', objectFit: 'cover' },
  privateProfile:       { width: '100%', maxWidth: '470px', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '50px 0', backgroundColor: 'white', borderTop: '1px solid #dbdbdb' },
  modalContent:         { backgroundColor: 'white', padding: '20px', borderRadius: '10px', width: '90%', maxWidth: '400px', display: 'flex', flexDirection: 'column' },
  label:                { fontSize: '14px', fontWeight: 'bold', marginTop: '10px', marginBottom: '5px' },
  input:                { padding: '8px', border: '1px solid #dbdbdb', borderRadius: '5px', outline: 'none' },
  textarea:             { padding: '8px', border: '1px solid #dbdbdb', borderRadius: '5px', outline: 'none', resize: 'none', height: '60px' },
  modalButtonContainer: { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' },
  cancelModalBtn:       { padding: '8px 15px', backgroundColor: '#efefef', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer' },
  saveModalBtn:         { padding: '8px 15px', backgroundColor: '#0095f6', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer' },
  listModal:            { backgroundColor: 'white', borderRadius: '10px', width: '90%', maxWidth: '400px', maxHeight: '60vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  listHeader:           { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', borderBottom: '1px solid #dbdbdb' },
  closeBtn:             { background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', fontWeight: 'bold' },
  listContainer:        { padding: '10px 15px', overflowY: 'auto' },
  userRow:              { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0' },
  listAvatar:           { width: '40px', height: '40px', borderRadius: '50%', objectFit: 'cover', marginRight: '15px', border: '1px solid #dbdbdb' },
  removeBtn:            { background: '#efefef', border: 'none', borderRadius: '5px', padding: '5px 12px', fontSize: '12px', cursor: 'pointer', fontWeight: 'bold' },
  carouselIcon:         { position: 'absolute', top: '5px', right: '5px', color: 'white', fontSize: '18px', textShadow: '0 0 5px rgba(0,0,0,0.8)' },
  modalOverlay:         { position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 2000 },
  closeBtnModal:        { position: 'absolute', top: '15px', right: '20px', background: 'none', border: 'none', color: 'white', fontSize: '30px', cursor: 'pointer', zIndex: 2001 },
  postModalSplit:       { display: 'flex', flexDirection: 'row', width: '90%', maxWidth: '1000px', height: '80vh', backgroundColor: 'white', borderRadius: '4px', overflow: 'hidden' },
  postLeft:             { flex: 2, backgroundColor: 'black', display: 'flex', alignItems: 'center', justifyContent: 'centear', position: 'relative' },
  postRight:            { flex: 1, display: 'flex', flexDirection: 'column', minWidth: '300px', backgroundColor: 'white' },
  postModalImage:       { width: '100%', height: '100%', objectFit: 'contain' },
  leftArrow:            { position: 'absolute', top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.7)', border: 'none', borderRadius: '50%', width: '30px', height: '30px', fontSize: '20px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', left: '10px' },
  rightArrow:           { position: 'absolute', top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.7)', border: 'none', borderRadius: '50%', width: '30px', height: '30px', fontSize: '20px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', right: '10px' },
  dotsContainer:        { position: 'absolute', bottom: '15px', display: 'flex', justifyContent: 'center', gap: '5px', width: '100%' },
  dot:                  { color: 'white', fontSize: '20px', textShadow: '0 0 3px black' },
  postRightHeader:      { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', borderBottom: '1px solid #efefef' },
  postCommentsArea:     { flex: 1, padding: '15px', overflowY: 'auto' },
  postRightFooter:      { padding: '15px', borderTop: '1px solid #efefef' },
  deleteMediaBtn:       { position: 'absolute', top: '15px', left: '15px', background: 'rgba(0,0,0,0.6)', border: 'none', color: 'white', fontSize: '16px', cursor: 'pointer', padding: '5px 10px', borderRadius: '5px', zIndex: 10 },
};

export default Profile;