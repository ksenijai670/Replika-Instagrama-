import React, { useState, useRef } from 'react';

function CreatePost() {
  const [opis, setOpis] = useState('');
  const [slike, setSlike] = useState([]); // file objekti pravi
  const [previewSlika, setPreviewSlika] = useState([]); // urlovi za prikaz korisniku 
  const [ucitavam, setUcitavam] = useState(false);
  
  const fileInputRef = useRef(null);

  
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

  
  const otvoriProzorZaSlike = () => {
    if (slike.length >= 20) {
      alert("Možeš dodati najviše 20 fajlova po specifikaciji!");
      return;
    }
    fileInputRef.current.click();
  };

  
  const handleIzborSlika = (e) => {
    const izabraniFajlovi = Array.from(e.target.files);
    
    // Provera broja fajlova (max 20 ukupno)
    if (slike.length + izabraniFajlovi.length > 20) {
      alert("Maksimalan broj fajlova po objavi je 20!");
      return;
    }

    // cuvanje pravih fajlova za slanje
    setSlike((prev) => [...prev, ...izabraniFajlovi]);

    
    const noviPreview = izabraniFajlovi.map((fajl) => URL.createObjectURL(fajl));
    setPreviewSlika((prev) => [...prev, ...noviPreview]);

    
    e.target.value = null;
  };

  const ukloniSliku = (indexZaBrisanje) => {
    setSlike(slike.filter((_, index) => index !== indexZaBrisanje));
    setPreviewSlika(previewSlika.filter((_, index) => index !== indexZaBrisanje));
  };

  // slanje na backend
  const handleObjavi = async () => {
    if (slike.length === 0) {
      alert("Moraš dodati barem jednu sliku!");
      return;
    }

    const token = localStorage.getItem('token');
    const myUserId = getMyUserId();

    if (!token || !myUserId) {
      alert("Morate biti ulogovani da biste objavili post!");
      return;
    }

    setUcitavam(true);

    const formData = new FormData();
    formData.append('caption', opis);
    
    slike.forEach((slika) => {
      formData.append('files', slika);
    });

    try {
      const odgovor = await fetch('http://localhost:4000/api/posts', {
        method: 'POST',
        headers: {
          
          'Authorization': `Bearer ${token}`,
          'x-user-id': String(myUserId)
        },
        body: formData
      });

      if (odgovor.ok) {
        alert("Bravo! Objava je uspešno kreirana!");
        setOpis('');
        setSlike([]);
        setPreviewSlika([]);
      } else {
        const errorData = await odgovor.json();
        alert(`Greška pri objavljivanju: ${errorData.error}`);
      }
    } catch (error) {
      console.error("Greška na mreži:", error);
      alert("Došlo je do greške pri komunikaciji sa serverom.");
    } finally {
      setUcitavam(false);
    }
  };

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h2 style={{ margin: 0, fontSize: '18px' }}>Nova objava</h2>
      </div>

      <div style={contentStyle}>
        {/* SKRIVENI INPUT ZA FAJLOVE */}
        <input 
          type="file" 
          multiple 
          accept="image/*,video/*" 
          ref={fileInputRef} 
          style={{ display: 'none' }} 
          onChange={handleIzborSlika}
        />

        {/* DEO ZA DODAVANJE SLIKA */}
        <div style={imageUploadArea} onClick={otvoriProzorZaSlike}>
          <span style={{ fontSize: '40px' }}>📸</span>
          <p style={{ margin: '5px 0', fontWeight: 'bold' }}>Klikni da dodaš sliku/video</p>
          <p style={{ fontSize: '12px', color: 'gray', margin: 0 }}>Max 20 fajlova (do 50MB)</p>
        </div>

        {/* PREGLED DODATIH SLIKA */}
        {previewSlika.length > 0 && (
          <div style={previewGridStyle}>
            {previewSlika.map((slika, index) => (
              <div key={index} style={previewImageContainerStyle}>
                <img src={slika} alt={`Preview ${index}`} style={previewImageStyle} />
                <button onClick={() => ukloniSliku(index)} style={removeImageBtnStyle}>×</button>
              </div>
            ))}
          </div>
        )}

        {/* DEO ZA OPIS */}
        <textarea 
          placeholder="Dodaj opis ༘˚⋆𐙚｡⋆𖦹.✧˚" 
          value={opis}
          onChange={(e) => setOpis(e.target.value)}
          style={textareaStyle}
          disabled={ucitavam}
        />

        <button 
          onClick={handleObjavi} 
          style={{...publishBtnStyle, backgroundColor: ucitavam ? '#b2dffc' : '#0095f6'}}
          disabled={ucitavam}
        >
          {ucitavam ? 'Objavljivanje...' : 'Objavi'}
        </button>
      </div>
    </div>
  );
}

// STILOVI
const containerStyle = { backgroundColor: '#fafafa', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center' };
const headerStyle = { width: '100%', maxWidth: '470px', padding: '15px', backgroundColor: 'white', borderBottom: '1px solid #dbdbdb', display: 'flex', justifyContent: 'center' };
const contentStyle = { width: '100%', maxWidth: '470px', padding: '20px', backgroundColor: 'white', flex: 1, display: 'flex', flexDirection: 'column', gap: '20px' };
const imageUploadArea = { border: '2px dashed #dbdbdb', borderRadius: '10px', padding: '40px 20px', textAlign: 'center', cursor: 'pointer', backgroundColor: '#fafafa' };
const previewGridStyle = { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' };
const previewImageContainerStyle = { position: 'relative', width: '100%', aspectRatio: '1/1' };
const previewImageStyle = { width: '100%', height: '100%', objectFit: 'cover', borderRadius: '8px' };
const removeImageBtnStyle = { position: 'absolute', top: '5px', right: '5px', backgroundColor: 'rgba(0,0,0,0.6)', color: 'white', border: 'none', borderRadius: '50%', width: '24px', height: '24px', cursor: 'pointer', fontWeight: 'bold' };
const textareaStyle = { width: '100%', height: '100px', padding: '15px', borderRadius: '8px', border: '1px solid #dbdbdb', outline: 'none', resize: 'none', fontSize: '14px', fontFamily: 'inherit' };
const publishBtnStyle = { width: '100%', padding: '12px', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '16px', cursor: 'pointer' };

export default CreatePost;