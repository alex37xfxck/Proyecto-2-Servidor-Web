/* =========================================================
   CONFIGURACIÓN DE SPOTIFY
   ========================================================= */

const CLIENT_ID =
    "a2c7f03b916b4d808baddd013980dcbf";

const REDIRECT_URI =
    "http://127.0.0.1:5500/callback.html";


/* =========================================================
   USUARIO ACTUAL
   Cada integrante utiliza sus propias claves de sesión.
   ========================================================= */

function getCurrentUser() {

    const path = window.location.pathname;

    if (path.includes("/Alex/")) {
        return "Alex";
    }

    if (path.includes("/Adzuria/")) {
        return "Adzuria";
    }

    if (path.includes("/Efra/")) {
        return "Efra";
    }

    if (path.includes("/Erik/")) {
        return "Erik";
    }

    return null;
}


function getAccessTokenKey() {

    return "spotify_access_token_" + getCurrentUser();
}


function getRefreshTokenKey() {

    return "spotify_refresh_token_" + getCurrentUser();
}


/* =========================================================
   PERMISOS SOLICITADOS
   ========================================================= */

const SCOPES = [
    "user-top-read",
    "user-read-recently-played",
    "user-read-private"
];


/* =========================================================
   PKCE
   ========================================================= */

function generateRandomString(length) {

    const characters =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

    const randomValues =
        new Uint32Array(length);

    crypto.getRandomValues(randomValues);

    let result = "";

    for (let i = 0; i < length; i++) {

        result += characters[
            randomValues[i] % characters.length
        ];
    }

    return result;
}


async function generateCodeChallenge(verifier) {

    const data =
        new TextEncoder().encode(verifier);

    const digest =
        await crypto.subtle.digest(
            "SHA-256",
            data
        );

    return btoa(
        String.fromCharCode(
            ...new Uint8Array(digest)
        )
    )
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}


/* =========================================================
   LOGIN CON SPOTIFY
   ========================================================= */

async function loginWithSpotify() {

    const returnPath =
        window.location.pathname;

    sessionStorage.setItem(
        "spotify_return_path",
        returnPath
    );


    const verifier =
        generateRandomString(128);

    const challenge =
        await generateCodeChallenge(verifier);


    /* ---------------------------------------------------------
       STATE
       Protege el flujo OAuth contra solicitudes no autorizadas.
       Se guarda para que callback.html pueda validarlo.
       --------------------------------------------------------- */

    const stateBytes =
        new Uint8Array(32);

    crypto.getRandomValues(stateBytes);

    const state =
        btoa(
            String.fromCharCode(...stateBytes)
        )
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");


    sessionStorage.setItem(
        "spotify_state",
        state
    );


    sessionStorage.setItem(
        "spotify_code_verifier",
        verifier
    );


    const params =
        new URLSearchParams({

            client_id: CLIENT_ID,
            response_type: "code",
            redirect_uri: REDIRECT_URI,
            state: state,
            code_challenge_method: "S256",
            code_challenge: challenge,
            scope: SCOPES.join(" ")

        });


    window.location.href =
        "https://accounts.spotify.com/authorize?" +
        params.toString();
}


/* =========================================================
   FUNCIONES AUXILIARES
   ========================================================= */

function sleep(milliseconds) {

    return new Promise(resolve => {
        setTimeout(resolve, milliseconds);
    });
}


/* =========================================================
   CONTROL DE PETICIONES
   Evita solicitudes simultáneas innecesarias.
   ========================================================= */

const MIN_REQUEST_GAP = 700;

let lastSpotifyRequest = 0;

let spotifyRequestQueue =
    Promise.resolve();


function queueSpotifyRequest(requestFunction) {

    const runRequest = async () => {

        const elapsed =
            Date.now() - lastSpotifyRequest;

        if (elapsed < MIN_REQUEST_GAP) {

            await sleep(
                MIN_REQUEST_GAP - elapsed
            );
        }

        try {

            return await requestFunction();

        } finally {

            lastSpotifyRequest =
                Date.now();
        }
    };


    const queuedRequest =
        spotifyRequestQueue.then(
            runRequest,
            runRequest
        );


    spotifyRequestQueue =
        queuedRequest.catch(() => {});


    return queuedRequest;
}


/* =========================================================
   ESCAPE HTML
   ========================================================= */

function escapeHtml(value) {

    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}


/* =========================================================
   CACHÉ
   Reduce solicitudes repetidas a Spotify.
   ========================================================= */

function getCacheKey(key) {

    return (
        "spotify_cache_" +
        getCurrentUser() +
        "_" +
        key
    );
}


function getCachedData(key, ttl) {

    try {

        const cache =
            sessionStorage.getItem(
                getCacheKey(key)
            );

        if (!cache) {
            return null;
        }


        const parsed =
            JSON.parse(cache);

        if (
            !parsed ||
            typeof parsed.timestamp !== "number" ||
            Date.now() - parsed.timestamp > ttl
        ) {

            sessionStorage.removeItem(
                getCacheKey(key)
            );

            return null;
        }


        return parsed.data;

    } catch (error) {

        console.error(
            "Error leyendo caché de Spotify:",
            error
        );

        return null;
    }
}


function saveCachedData(key, data) {

    try {

        sessionStorage.setItem(
            getCacheKey(key),
            JSON.stringify({
                timestamp: Date.now(),
                data
            })
        );

    } catch (error) {

        console.error(
            "Error guardando caché de Spotify:",
            error
        );
    }
}


/* =========================================================
   REFRESH TOKEN
   ========================================================= */

let refreshPromise = null;


async function refreshSpotifyToken() {

    if (refreshPromise) {
        return refreshPromise;
    }


    refreshPromise = (async () => {

        const refreshToken =
            sessionStorage.getItem(
                getRefreshTokenKey()
            );


        if (!refreshToken) {
            return false;
        }


        try {

            const response =
                await fetch(
                    "https://accounts.spotify.com/api/token",
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/x-www-form-urlencoded"
                        },

                        body: new URLSearchParams({
                            grant_type: "refresh_token",
                            refresh_token: refreshToken,
                            client_id: CLIENT_ID
                        })
                    }
                );


            const data =
                await response.json();


            if (!response.ok) {

                if (data.error === "invalid_grant") {

                    sessionStorage.removeItem(
                        getAccessTokenKey()
                    );

                    sessionStorage.removeItem(
                        getRefreshTokenKey()
                    );
                }

                throw new Error(
                    data.error_description ||
                    "No se pudo renovar el token."
                );
            }


            sessionStorage.setItem(
                getAccessTokenKey(),
                data.access_token
            );


            if (data.refresh_token) {

                sessionStorage.setItem(
                    getRefreshTokenKey(),
                    data.refresh_token
                );
            }


            return true;

        } catch (error) {

            console.error(
                "Error renovando token:",
                error
            );

            return false;

        } finally {

            refreshPromise = null;
        }

    })();


    return refreshPromise;
}


/* =========================================================
   PETICIONES A SPOTIFY
   Maneja tokens expirados y límites de solicitudes.
   ========================================================= */

async function spotifyFetch(url, options = {}) {

    return queueSpotifyRequest(async () => {

        let token =
            sessionStorage.getItem(
                getAccessTokenKey()
            );

        if (!token) {

            throw new Error(
                "No hay sesión de Spotify."
            );
        }


        const makeRequest =
            currentToken => {

                const headers = {
                    ...(options.headers || {}),
                    Authorization:
                        "Bearer " + currentToken
                };

                return fetch(
                    url,
                    {
                        ...options,
                        headers
                    }
                );
            };


        let response =
            await makeRequest(token);


        /* -----------------------------------------------------
           Access token expirado
           ----------------------------------------------------- */
        if (response.status === 401) {

            const refreshed =
                await refreshSpotifyToken();


            if (!refreshed) {
                return response;
            }


            token =
                sessionStorage.getItem(
                    getAccessTokenKey()
                );


            if (!token) {
                return response;
            }


            response =
                await makeRequest(token);
        }


        /* -----------------------------------------------------
           Rate limit / cuota
           ----------------------------------------------------- */
        if (response.status === 429) {

            let errorData = null;

            try {

                errorData =
                    await response
                        .clone()
                        .json();

            } catch (error) {

                errorData = null;
            }


            if (
                errorData?.error?.reason ===
                "QUOTA_EXCEEDED"
            ) {

                throw new Error(
                    "Spotify alcanzó la cuota de la aplicación. " +
                    "Evita recargar repetidamente y vuelve a intentarlo más tarde."
                );
            }


            const retryAfter =
                Number(
                    response.headers.get("Retry-After")
                ) || 5;


            console.warn(
                "Spotify está limitando las solicitudes. " +
                `Reintentando en ${retryAfter} segundos...`
            );


            await sleep(
                retryAfter * 1000
            );


            token =
                sessionStorage.getItem(
                    getAccessTokenKey()
                );


            if (!token) {
                return response;
            }


            response =
                await makeRequest(token);


            if (response.status === 429) {

                throw new Error(
                    "Spotify sigue limitando las solicitudes. " +
                    "Espera unos segundos antes de volver a cargar."
                );
            }
        }


        return response;
    });
}


/* =========================================================
   MANEJO DE ERRORES VISUALES
   ========================================================= */

function showSpotifyError(container, message) {

    if (!container) {
        return;
    }

    container.innerHTML = `
        <p>${escapeHtml(message)}</p>
    `;
}


/* =========================================================
   ARTISTAS FAVORITOS
   ========================================================= */

async function loadTopArtists(period = "medium_term") {

    const token =
        sessionStorage.getItem(
            getAccessTokenKey()
        );

    const container =
        document.getElementById("top-artists");


    if (!token || !container) {
        return;
    }


    const cacheKey =
        "top_artists_" + period;

    const cached =
        getCachedData(
            cacheKey,
            60 * 1000
        );


    if (cached) {

        renderTopArtists(
            container,
            cached
        );

        return;
    }


    try {

        const response =
            await spotifyFetch(
                "https://api.spotify.com/v1/me/top/artists" +
                `?limit=5&time_range=${period}`
            );


        if (!response.ok) {
            throw new Error(
                "No se pudieron obtener los artistas."
            );
        }


        const data =
            await response.json();


        saveCachedData(
            cacheKey,
            data
        );


        renderTopArtists(
            container,
            data
        );

    } catch (error) {

        console.error(error);

        showSpotifyError(
            container,
            error.message ||
            "No se pudieron cargar tus artistas."
        );
    }
}


function renderTopArtists(container, data) {

    container.innerHTML = "";


    if (
        !data?.items ||
        data.items.length === 0
    ) {

        container.innerHTML =
            "<p>No encontramos artistas para este periodo.</p>";

        return;
    }


    data.items.forEach(
        (artist, index) => {

            const artistElement =
                document.createElement("div");


            artistElement.className =
                index === 0
                    ? "artist-card top-artist"
                    : "artist-card";


            const spotifyUrl =
                artist.external_urls?.spotify;


            if (spotifyUrl) {

                artistElement.style.cursor =
                    "pointer";

                artistElement.addEventListener(
                    "click",
                    () => {
                        window.open(
                            spotifyUrl,
                            "_blank"
                        );
                    }
                );
            }


            const imageUrl =
                artist.images?.[0]?.url || "";


            artistElement.innerHTML = `
                <img
                    src="${escapeHtml(imageUrl)}"
                    alt="${escapeHtml(artist.name)}"
                >

                <div class="artist-info">

                    ${
                        index === 0
                            ? `
                                <span class="top-artist-label">
                                    TU ARTISTA #1
                                </span>
                              `
                            : `
                                <span>
                                    #${index + 1}
                                </span>
                              `
                    }

                    <h3>
                        ${escapeHtml(artist.name)}
                    </h3>

                </div>
            `;


            container.appendChild(
                artistElement
            );
        }
    );
}


/* =========================================================
   CANCIONES FAVORITAS
   ========================================================= */

async function loadTopTracks(period = "medium_term") {

    const token =
        sessionStorage.getItem(
            getAccessTokenKey()
        );

    const container =
        document.getElementById("top-tracks");


    if (!token || !container) {
        return;
    }


    const cacheKey =
        "top_tracks_" + period;

    const cached =
        getCachedData(
            cacheKey,
            60 * 1000
        );


    if (cached) {

        renderTopTracks(
            container,
            cached
        );

        return;
    }


    try {

        const response =
            await spotifyFetch(
                "https://api.spotify.com/v1/me/top/tracks" +
                `?limit=5&time_range=${period}`
            );


        if (!response.ok) {
            throw new Error(
                "No se pudieron obtener las canciones."
            );
        }


        const data =
            await response.json();


        saveCachedData(
            cacheKey,
            data
        );


        renderTopTracks(
            container,
            data
        );

    } catch (error) {

        console.error(error);

        showSpotifyError(
            container,
            error.message ||
            "No se pudieron cargar tus canciones."
        );
    }
}


function renderTopTracks(container, data) {

    container.innerHTML = "";


    if (
        !data?.items ||
        data.items.length === 0
    ) {

        container.innerHTML =
            "<p>No encontramos canciones para este periodo.</p>";

        return;
    }


    data.items.forEach(
        (track, index) => {

            const trackElement =
                document.createElement("div");


            trackElement.className =
                index === 0
                    ? "track-card top-track"
                    : "track-card";


            const spotifyUrl =
                track.external_urls?.spotify;


            if (spotifyUrl) {

                trackElement.style.cursor =
                    "pointer";

                trackElement.addEventListener(
                    "click",
                    () => {
                        window.open(
                            spotifyUrl,
                            "_blank"
                        );
                    }
                );
            }


            const imageUrl =
                track.album?.images?.[0]?.url ||
                "";


            const artistNames =
                track.artists
                    ?.map(artist => artist.name)
                    .join(", ") ||
                "";


            trackElement.innerHTML = `
                <img
                    src="${escapeHtml(imageUrl)}"
                    alt="${escapeHtml(track.album?.name || "Álbum")}"
                >

                <div class="track-info">

                    ${
                        index === 0
                            ? `
                                <span class="top-track-label">
                                    TU CANCIÓN #1
                                </span>
                              `
                            : `
                                <span>
                                    #${index + 1}
                                </span>
                              `
                    }

                    <h3>
                        ${escapeHtml(track.name)}
                    </h3>

                    <p>
                        ${escapeHtml(artistNames)}
                    </p>

                </div>
            `;


            container.appendChild(
                trackElement
            );
        }
    );
}


/* =========================================================
   ESCUCHADO RECIENTEMENTE
   ========================================================= */

async function loadRecentlyPlayed() {

    const token =
        sessionStorage.getItem(
            getAccessTokenKey()
        );

    const container =
        document.getElementById("recently-played");


    if (!token || !container) {
        return;
    }


    const cacheKey =
        "recently_played";

    const cached =
        getCachedData(
            cacheKey,
            30 * 1000
        );


    if (cached) {

        renderRecentlyPlayed(
            container,
            cached
        );

        return;
    }


    try {

        const response =
            await spotifyFetch(
                "https://api.spotify.com/v1/me/player/recently-played" +
                "?limit=5"
            );


        if (!response.ok) {
            throw new Error(
                "No se pudo obtener la actividad reciente."
            );
        }


        const data =
            await response.json();


        saveCachedData(
            cacheKey,
            data
        );


        renderRecentlyPlayed(
            container,
            data
        );

    } catch (error) {

        console.error(error);

        showSpotifyError(
            container,
            error.message ||
            "No se pudo cargar tu actividad reciente."
        );
    }
}


function renderRecentlyPlayed(container, data) {

    container.innerHTML = "";


    if (
        !data?.items ||
        data.items.length === 0
    ) {

        container.innerHTML =
            "<p>No encontramos actividad reciente.</p>";

        return;
    }


    data.items.forEach(
        (item, index) => {

            const track =
                item.track;


            if (!track) {
                return;
            }


            const trackElement =
                document.createElement("div");


            trackElement.className =
                "track-card";


            const spotifyUrl =
                track.external_urls?.spotify;


            if (spotifyUrl) {

                trackElement.style.cursor =
                    "pointer";

                trackElement.addEventListener(
                    "click",
                    () => {
                        window.open(
                            spotifyUrl,
                            "_blank"
                        );
                    }
                );
            }


            const imageUrl =
                track.album?.images?.[0]?.url ||
                "";


            const artistNames =
                track.artists
                    ?.map(artist => artist.name)
                    .join(", ") ||
                "";


            trackElement.innerHTML = `
                <img
                    src="${escapeHtml(imageUrl)}"
                    alt="${escapeHtml(track.album?.name || "Álbum")}"
                >

                <div class="track-info">

                    <span>
                        #${index + 1}
                    </span>

                    <h3>
                        ${escapeHtml(track.name)}
                    </h3>

                    <p>
                        ${escapeHtml(artistNames)}
                    </p>

                </div>
            `;


            container.appendChild(
                trackElement
            );
        }
    );
}


/* =========================================================
   PERFIL DE SPOTIFY
   ========================================================= */

async function loadSpotifyProfile() {

    const token =
        sessionStorage.getItem(
            getAccessTokenKey()
        );

    const container =
        document.getElementById("spotify-profile");


    if (!token || !container) {
        return;
    }


    const cacheKey =
        "profile";

    const cached =
        getCachedData(
            cacheKey,
            10 * 60 * 1000
        );


    if (cached) {

        renderSpotifyProfile(
            container,
            cached
        );

        return;
    }


    try {

        const response =
            await spotifyFetch(
                "https://api.spotify.com/v1/me"
            );


        if (!response.ok) {
            throw new Error(
                "No se pudo obtener tu perfil."
            );
        }


        const profile =
            await response.json();


        saveCachedData(
            cacheKey,
            profile
        );


        renderSpotifyProfile(
            container,
            profile
        );

    } catch (error) {

        console.error(error);

        showSpotifyError(
            container,
            error.message ||
            "No se pudo cargar tu perfil."
        );
    }
}


function renderSpotifyProfile(container, profile) {

    const imageUrl =
        profile.images?.[0]?.url ||
        "";

    const displayName =
        profile.display_name ||
        "Usuario de Spotify";


    container.innerHTML = `
        <div class="spotify-profile-card">

            <img
                src="${escapeHtml(imageUrl)}"
                alt="Foto de perfil"
            >

            <div>

                <span>
                    USUARIO
                </span>

                <h3>
                    ${escapeHtml(displayName)}
                </h3>

            </div>

        </div>
    `;
}


/* =========================================================
   SELECTOR DE PERIODOS
   ========================================================= */

document
    .querySelectorAll(".period-button")
    .forEach(button => {

        button.addEventListener(
            "click",
            async () => {

                const buttons =
                    document.querySelectorAll(
                        ".period-button"
                    );


                buttons.forEach(btn => {
                    btn.disabled = true;
                });


                buttons.forEach(btn => {
                    btn.classList.remove("active");
                });


                button.classList.add("active");


                const period =
                    button.dataset.period;


                try {

                    await loadTopArtists(
                        period
                    );

                    await loadTopTracks(
                        period
                    );

                } finally {

                    buttons.forEach(btn => {
                        btn.disabled = false;
                    });
                }

            }
        );
    });


/* =========================================================
   CARGA INICIAL
   ========================================================= */

async function loadInitialSpotifyData() {

    await loadSpotifyProfile();

    await loadTopArtists();

    await loadTopTracks();

    await loadRecentlyPlayed();
}


loadInitialSpotifyData();
