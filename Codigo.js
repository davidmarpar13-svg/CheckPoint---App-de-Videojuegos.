// ==========================================
// CONFIGURACIÓN Y CREDENCIALES PRIVADAS
// ==========================================

// Configuración de tu base de datos y autenticación de Firebase
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCNC946r3Cs4Os7DppnQpBoOuuWyS9m3BI",
  authDomain: "punto-de-control-23bea.firebaseapp.com",
  projectId: "punto-de-control-23bea",
  storageBucket: "punto-de-control-23bea.firebasestorage.app",
  messagingSenderId: "558628109891",
  appId: "1:558628109891:web:4b89ab738fca6898fe5ef6"
};

// Credenciales API de IGDB (Twitch)
const TWITCH_CLIENT_ID = 'rfwc0kzmp70ydy00oj7qq69bfa07dl';
const TWITCH_CLIENT_SECRET = 'zgi246d7qb6qpzkjppahrg4b8xqgnq';

function getAutoToken() {
  let props = PropertiesService.getScriptProperties();
  let token = props.getProperty('igdb_auto_token');
  
  if (!token) {
    let url = "https://id.twitch.tv/oauth2/token";
    let payload = {
      client_id: String(TWITCH_CLIENT_ID).trim(),
      client_secret: String(TWITCH_CLIENT_SECRET).trim(),
      grant_type: "client_credentials"
    };
    let options = { method: 'post', payload: payload, muteHttpExceptions: true };
    let response = UrlFetchApp.fetch(url, options);
    
    if (response.getResponseCode() === 200) {
      let data = JSON.parse(response.getContentText());
      token = data.access_token;
      props.setProperty('igdb_auto_token', token);
    } else {
      throw new Error("Twitch rechazó las claves: " + response.getContentText());
    }
  }
  return token;
}

function resetToken() {
  PropertiesService.getScriptProperties().deleteProperty('igdb_auto_token');
}

function consultaIGDBAvanzada(query) {
  // Utilizamos tu sistema automático de tokens que ya tienes creado arriba
  let clientId = TWITCH_CLIENT_ID; 
  let token = getAutoToken(); 

  let options = {
    'method' : 'post',
    'contentType': 'text/plain',
    'headers': {
      'Client-ID': clientId,
      'Authorization': 'Bearer ' + token
    },
    'payload' : query,
    'muteHttpExceptions': true
  };
  
  let response = UrlFetchApp.fetch('https://api.igdb.com/v4/games', options);
  return response.getContentText();
}

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Punto de Control')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no');
}

function getFirebaseConfig() {
  return FIREBASE_CONFIG;
}

function searchIGDBGames(query) {
  const url = 'https://api.igdb.com/v4/games';
  const body = `search "${query}"; fields id, name, cover.image_id, category; limit 50;`;
  
  let options = {
    method: 'post',
    headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': 'Bearer ' + getAutoToken(), 'Accept': 'application/json' },
    payload: body,
    muteHttpExceptions: true
  };
  
  try {
    let response = UrlFetchApp.fetch(url, options);
    
    if (response.getResponseCode() === 401) {
      resetToken();
      options.headers['Authorization'] = 'Bearer ' + getAutoToken();
      response = UrlFetchApp.fetch(url, options);
    }
    
    if (response.getResponseCode() === 200) {
        let results = JSON.parse(response.getContentText());
        
        // 🔥 EL TRUCO: Filtramos aquí. Exigimos que tenga carátula y que la categoría no sea 5 (Mods)
        let juegosLimpios = results.filter(g => g.cover != null && g.category !== 5);
        
        return juegosLimpios.map(g => ({
            id: g.id,
            name: g.name,
            background_image: g.cover && g.cover.image_id ? `https://images.igdb.com/igdb/image/upload/t_1080p/${g.cover.image_id}.jpg` : ''
        }));
    }
    return [];
  } catch (e) { return []; }
}

function getIGDBGameDetails(gameId) {
  const url = 'https://api.igdb.com/v4/games';
 const body = `where id = ${gameId}; fields id, name, cover.image_id, platforms.name, genres.name, first_release_date, involved_companies.company.name, involved_companies.developer, involved_companies.publisher, videos.video_id, total_rating, summary, screenshots.image_id, artworks.image_id;`;

  let options = {
    method: 'post',
    headers: { 'Client-ID': TWITCH_CLIENT_ID, 'Authorization': 'Bearer ' + getAutoToken(), 'Accept': 'application/json' },
    payload: body,
    muteHttpExceptions: true
  };

  try {
    let response = UrlFetchApp.fetch(url, options);
    
    if (response.getResponseCode() === 401) {
      resetToken();
      options.headers['Authorization'] = 'Bearer ' + getAutoToken();
      response = UrlFetchApp.fetch(url, options);
    }

    if (response.getResponseCode() === 200) {
      const dataList = JSON.parse(response.getContentText());
      if (!dataList || dataList.length === 0) return null;
      let g = dataList[0];
      
      let developers = []; let publishers = [];
      if (g.involved_companies) {
        g.involved_companies.forEach(c => {
          if (c.developer && c.company) developers.push({ name: c.company.name });
          if (c.publisher && c.company) publishers.push({ name: c.company.name });
        });
      }
      
      let ratingStr = "N/D";
      if (g.age_ratings) {
         let esrb = g.age_ratings.find(r => r.category === 1); 
         if (esrb) {
            const esrbMap = { 8: "E", 9: "E10+", 10: "T", 11: "M", 12: "AO" }; ratingStr = esrbMap[esrb.rating] || "Todos";
         } else {
            let pegi = g.age_ratings.find(r => r.category === 2); 
            if (pegi) { const pegiMap = { 1: "3", 2: "7", 3: "12", 4: "16", 5: "18" }; ratingStr = "PEGI " + (pegiMap[pegi.rating] || "N/D"); }
         }
      }

      let date = "N/D";
      if (g.first_release_date) {
        let d = new Date(g.first_release_date * 1000);
        let months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        date = `${d.getDate()} de ${months[d.getMonth()]} de ${d.getFullYear()}`;
      }
      
      let website = "";
      if (g.websites) {
         let official = g.websites.find(w => w.category === 1);
         if (official) website = official.url; else website = g.websites[0].url; 
      }

      let screenshots = [];
      if (g.screenshots) screenshots = g.screenshots.map(s => `https://images.igdb.com/igdb/image/upload/t_1080p/${s.image_id}.jpg`);

      // Traducción automática del inglés al español
      let summaryEs = g.summary || 'Sin descripción detallada disponible en la red.';
      if (g.summary && g.summary.trim().length > 0) {
          try {
              summaryEs = LanguageApp.translate(g.summary, 'en', 'es');
          } catch(err) {
              // Si falla la traducción, deja el original
          }
      }

      if (g.platforms) {
        let isRetroHandheld = g.platforms.some(p => {
            let platName = p.name.toLowerCase();
            return platName.includes('nintendo ds') || 
                   platName.includes('nintendo 3ds') || 
                   platName.includes('game boy') || 
                   platName.includes('gameboy');
        });

        if (isRetroHandheld) {
            g.screenshots = null; // Eliminamos los screenshots de la memoria para forzar el uso de artworks
        }
    }
    
    return {
        id: g.id,
    name: g.name, developers: developers, publishers: publishers,
      platforms: g.platforms ? g.platforms.map(p => ({ name: p.name })) : [],
      genres: g.genres ? g.genres.map(gn => ({ name: gn.name })) : [],
      released: date, esrb_rating: { name: ratingStr },
      description_raw: summaryEs,
      website: website,
      tags: g.game_modes ? g.game_modes.map(m => ({ name: m.name })) : [],
      background_image: screenshots.length > 0 ? screenshots[0] : (g.cover ? `https://images.igdb.com/igdb/image/upload/t_1080p/${g.cover.image_id}.jpg` : ''),
      background_image_additional: screenshots.length > 1 ? screenshots[1] : '',
      videos: g.videos ? g.videos.map(v => v.video_id) : [],
      screenshots: g.screenshots ? g.screenshots.map(s => s.image_id) : [],
      artworks: g.artworks ? g.artworks.map(a => a.image_id) : [],
      cover: g.cover ? g.cover.image_id : '',
      rating: g.total_rating ? (g.total_rating / 20).toFixed(1) : 0
    };
    }
    return null;
  } catch (e) { return null; }
}

function getIGDBGameSmart(param1, param2) {
  let id = null;
  let title = null;
  
  // Magia para detectar automáticamente cuál es el ID (número) y cuál es el Título (texto)
  if (param1 && !isNaN(param1) && String(param1).trim() !== '') id = String(param1).trim();
  else if (param1 && typeof param1 === 'string') title = param1.trim();
  
  if (param2 && !isNaN(param2) && String(param2).trim() !== '') id = String(param2).trim();
  else if (param2 && typeof param2 === 'string') title = param2.trim();

  // 1. PRIORIDAD ABSOLUTA: Buscar por ID exacto
  if (id) {
    let details = getIGDBGameDetails(id);
    if (details) return details;
  }
  
  // 2. PLAN B: Buscar por nombre solo si el ID falla
  if (title) {
    let results = searchIGDBGames(title);
    if (results && results.length > 0) {
      return getIGDBGameDetails(results[0].id);
    }
  }
  
  return null; // Si no encuentra absolutamente nada
}

function PROBAR_API() {
  try {
    Logger.log("1. Borrando memoria antigua...");
    resetToken();
    
    Logger.log("2. Pidiendo token fresco a Twitch...");
    let token = getAutoToken();
    Logger.log("Token obtenido correctamente.");
    
    Logger.log("3. Buscando 'Hellblade' en la API...");
    let busqueda = searchIGDBGames("Hellblade");
    if (busqueda.length === 0) throw new Error("Búsqueda vacía. La API no devolvió juegos.");
    Logger.log("Juego encontrado: " + busqueda[0].name);
    
    Logger.log("4. Descargando detalles completos...");
    let detalles = getIGDBGameDetails(busqueda[0].id);
    if (!detalles) throw new Error("Fallo al descargar los detalles del juego.");
    
    Logger.log("¡ÉXITO ABSOLUTO! Todo funciona.");
  } catch(e) {
    Logger.log("❌ ERROR CRÍTICO: " + e.message);
  }
} // <--- ESTA LLAVE CIERRA LA FUNCIÓN PROBAR_API() POR COMPLETO

// =====================================================================
// --- FUNCIONES DE COMUNIDAD PARA FIREBASE (Backend automático) ---
// =====================================================================

function getComunidadUrl() {
  // Extraemos el ID de tu proyecto directamente de tu FIREBASE_CONFIG
  var projectId = FIREBASE_CONFIG.projectId; 
  var baseUrl = "https://" + projectId + "-default-rtdb.firebaseio.com";
  return baseUrl + "/comunidad_temas.json";
}

function guardarTemaComunidad(hiloData) {
  try {
    var url = getComunidadUrl();
    var options = {
      method: "post", 
      contentType: "application/json",
      payload: JSON.stringify(hiloData)
    };
    
    var response = UrlFetchApp.fetch(url, options);
    return response.getContentText();
  } catch(e) {
    throw new Error("Error al guardar en Firebase: " + e.message);
  }
}

function obtenerTemasComunidad() {
  try {
    var url = getComunidadUrl();
    var response = UrlFetchApp.fetch(url);
    return response.getContentText();
  } catch(e) {
    throw new Error("Error al descargar de Firebase: " + e.message);
  }
}

function borrarTemaComunidad(temaId) {
  try {
    // Busca la ruta exacta del tema y lo fulmina de Firebase
    var baseUrl = getComunidadUrl().replace(".json", "");
    var url = baseUrl + "/" + temaId + ".json";
    var options = { method: "delete" };
    
    UrlFetchApp.fetch(url, options);
    return true;
  } catch(e) {
    throw new Error("Error al borrar en Firebase: " + e.message);
  }
}

// --- FUNCIONES NUEVAS PARA COMENTARIOS Y LIKES ---

function guardarComentarioComunidad(temaId, comentarioData) {
  try {
    var baseUrl = getComunidadUrl().replace(".json", "");
    
    // LA CLAVE: Forzamos "put" y la ruta exacta con el ID para no perder la conexión de los likes
    var url = baseUrl + "/" + temaId + "/comentarios/" + comentarioData.id + ".json";
    var options = { method: "put", contentType: "application/json", payload: JSON.stringify(comentarioData) };
    UrlFetchApp.fetch(url, options);

    var countUrl = baseUrl + "/" + temaId + "/comments.json";
    var currentCount = Number(UrlFetchApp.fetch(countUrl).getContentText()) || 0;
    UrlFetchApp.fetch(countUrl, { method: "put", contentType: "application/json", payload: JSON.stringify(currentCount + 1) });
    
    return true;
  } catch(e) { throw new Error(e.message); }
}

function darLikeTemaComunidad(temaId, uid) {
  try {
    var baseUrl = getComunidadUrl().replace(".json", "");
    var likedByUrl = baseUrl + "/" + temaId + "/likedBy/" + uid + ".json";
    var alreadyLiked = UrlFetchApp.fetch(likedByUrl).getContentText();
    var likesUrl = baseUrl + "/" + temaId + "/likes.json";
    var currentLikes = Number(UrlFetchApp.fetch(likesUrl).getContentText()) || 0;
    
    if (alreadyLiked === "true") {
      // Si ya le dio like, se lo quitamos (Toggle Off)
      UrlFetchApp.fetch(likedByUrl, { method: "delete" });
      var newLikes = Math.max(0, currentLikes - 1);
      UrlFetchApp.fetch(likesUrl, { method: "put", payload: JSON.stringify(newLikes) });
      return newLikes;
    } else {
      // Si no le ha dado like, se lo sumamos (Toggle On)
      UrlFetchApp.fetch(likedByUrl, { method: "put", payload: "true" });
      var newLikes = currentLikes + 1;
      UrlFetchApp.fetch(likesUrl, { method: "put", payload: JSON.stringify(newLikes) });
      return newLikes;
    }
  } catch(e) { return false; }
}

function darLikeComentarioComunidad(temaId, comentarioId, uid) {
  try {
    var baseUrl = getComunidadUrl().replace(".json", "");
    var likedByUrl = baseUrl + "/" + temaId + "/comentarios/" + comentarioId + "/likedBy/" + uid + ".json";
    var alreadyLiked = UrlFetchApp.fetch(likedByUrl).getContentText();
    var likesUrl = baseUrl + "/" + temaId + "/comentarios/" + comentarioId + "/likes.json";
    var currentLikes = Number(UrlFetchApp.fetch(likesUrl).getContentText()) || 0;
    
    if (alreadyLiked === "true") {
      // Quitar Like del comentario
      UrlFetchApp.fetch(likedByUrl, { method: "delete" });
      var newLikes = Math.max(0, currentLikes - 1);
      UrlFetchApp.fetch(likesUrl, { method: "put", payload: JSON.stringify(newLikes) });
      return newLikes;
    } else {
      // Dar Like al comentario
      UrlFetchApp.fetch(likedByUrl, { method: "put", payload: "true" });
      var newLikes = currentLikes + 1;
      UrlFetchApp.fetch(likesUrl, { method: "put", payload: JSON.stringify(newLikes) });
      return newLikes;
    }
  } catch(e) { return false; }
}
