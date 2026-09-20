const CLIENT_ID = "a2c7f03b916b4d808baddd013980dcbf";
const REDIRECT_URI = "http://127.0.0.1:5500/callback.html";

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

    return "Alex";
}

function getAccessTokenKey() {
    return "spotify_access_token_" + getCurrentUser();
}

function getRefreshTokenKey() {
    return "spotify_refresh_token_" + getCurrentUser();
}

const SCOPES = [
    "user-top-read",
    "user-read-recently-played",
    "user-read-private"
];

function generateRandomString(length) {
    const characters =
        "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";

    for (let i = 0; i < length; i++) {
        result += characters.charAt(
            Math.floor(Math.random() * characters.length)
        );
    }

    return result;
}

async function generateCodeChallenge(verifier) {
    const data = new TextEncoder().encode(verifier);

    const digest = await crypto.subtle.digest("SHA-256", data);

    return btoa(
        String.fromCharCode(...new Uint8Array(digest))
    )
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

async function loginWithSpotify() {

    // Guardamos la página desde la que inició sesión
    const returnPath = window.location.pathname;

    sessionStorage.setItem(
        "spotify_return_path",
        returnPath
    );

    // Generamos el verificador PKCE
    const verifier = generateRandomString(128);

    // Generamos el challenge
    const challenge = await generateCodeChallenge(verifier);

    // Guardamos el verifier para usarlo después en callback.html
    sessionStorage.setItem(
        "spotify_code_verifier",
        verifier
    );

    // Parámetros de autorización de Spotify
    const params = new URLSearchParams({
        client_id: CLIENT_ID,
        response_type: "code",
        redirect_uri: REDIRECT_URI,
        code_challenge_method: "S256",
        code_challenge: challenge,
        scope: SCOPES.join(" ")
    });

    // Redirigimos a Spotify
    window.location.href =
        "https://accounts.spotify.com/authorize?" +
        params.toString();
}

async function loadTopArtists(period = "medium_term") {
    const token = sessionStorage.getItem(
        getAccessTokenKey()
    );

    const container = document.getElementById("top-artists");

    if (!token || !container) {
        return;
    }

    try {
        const response = await spotifyFetch(
            `https://api.spotify.com/v1/me/top/artists?limit=5&time_range=${period}`
        );

        if (!response.ok) {
            throw new Error("No se pudieron obtener los artistas.");
        }

        const data = await response.json();

        container.innerHTML = "";

        data.items.forEach((artist, index) => {
            const artistElement = document.createElement("div");

            // Clase para aplicar el diseño de las tarjetas
            artistElement.className =
                index === 0
                    ? "artist-card top-artist"
                    : "artist-card";

            artistElement.style.cursor = "pointer";

            artistElement.addEventListener("click", () => {
                window.open(
                    artist.external_urls.spotify,
                    "_blank"
                );
            });

            artistElement.innerHTML = `
                <img
                    src="${artist.images[0]?.url || ""}"
                    alt="${artist.name}"
                >

                <div class="artist-info">
                    ${
                        index === 0
                            ? '<span class="top-artist-label">TU ARTISTA #1</span>'
                            : `<span>#${index + 1}</span>`
                    }

                    <h3>${artist.name}</h3>
                </div>
            `;

            container.appendChild(artistElement);
        });

    } catch (error) {
        console.error(error);

        container.innerHTML =
            "<p>No se pudieron cargar tus artistas.</p>";
    }
}

async function refreshSpotifyToken() {
        const refreshToken = sessionStorage.getItem(
        getRefreshTokenKey()
    );

    if (!refreshToken) {
        return false;
    }

    try {
        const response = await fetch(
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

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error_description || "No se pudo renovar el token."
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
        console.error("Error renovando token:", error);
        return false;
    }
}

async function spotifyFetch(url, options = {}) {
    let token = sessionStorage.getItem(
        getAccessTokenKey()
    );

    if (!token) {
        throw new Error("No hay sesión de Spotify.");
    }

    const headers = {
        ...(options.headers || {}),
        Authorization: "Bearer " + token
    };

    let response = await fetch(url, {
        ...options,
        headers
    });

    // Si el token expiró, intentamos renovarlo
    if (response.status !== 401) {
        return response;
    }

    const refreshed = await refreshSpotifyToken();

    if (!refreshed) {
        return response;
    }

    // Usamos el nuevo token
    token = sessionStorage.getItem(
        getAccessTokenKey()
    );

    headers.Authorization = "Bearer " + token;

    return fetch(url, {
        ...options,
        headers
    });
}


loadTopArtists();

document.querySelectorAll(".period-button").forEach(button => {
    button.addEventListener("click", () => {

        const period = button.dataset.period;

        document.querySelectorAll(".period-button").forEach(btn => {
            btn.classList.remove("active");
        });

        button.classList.add("active");

        loadTopArtists(period);
        loadTopTracks(period);
    });
});



async function loadTopTracks(period = "medium_term") {
        const token = sessionStorage.getItem(
        getAccessTokenKey()
    );
    const container = document.getElementById("top-tracks");

    if (!token || !container) {
        return;
    }

    try {
        const response = await spotifyFetch(
            `https://api.spotify.com/v1/me/top/tracks?limit=5&time_range=${period}`
        );

        if (!response.ok) {
            throw new Error("No se pudieron obtener las canciones.");
        }

        const data = await response.json();

        container.innerHTML = "";

        data.items.forEach((track, index) => {
            const trackElement = document.createElement("div");

            trackElement.className =
            index === 0 ? "track-card top-track" : "track-card";
            trackElement.style.cursor = "pointer";

            trackElement.addEventListener("click", () => {
                window.open(track.external_urls.spotify, "_blank");
            });

            trackElement.innerHTML = `
                <img
                    src="${track.album.images[0]?.url || ""}"
                    alt="${track.album.name}"
                >

                <div class="track-info">
                    ${
                    index === 0
                        ? '<span class="top-track-label">TU CANCIÓN #1</span>'
                        : `<span>#${index + 1}</span>`
                }

                <h3>${track.name}</h3>
                    <p>${track.artists.map(artist => artist.name).join(", ")}</p>
                </div>
            `;

            container.appendChild(trackElement);
        });

    } catch (error) {
        console.error(error);

        container.innerHTML =
            "<p>No se pudieron cargar tus canciones.</p>";
    }
}

loadTopTracks();

async function loadRecentlyPlayed() {
        const token = sessionStorage.getItem(
        getAccessTokenKey()
    );
    const container = document.getElementById("recently-played");

    if (!token || !container) {
        return;
    }

    try {
        const response = await spotifyFetch(
            "https://api.spotify.com/v1/me/player/recently-played?limit=5"
        );

        if (!response.ok) {
            throw new Error(
                "No se pudo obtener la actividad reciente."
            );
        }

        const data = await response.json();

        container.innerHTML = "";

        data.items.forEach((item, index) => {
            const track = item.track;

            const trackElement = document.createElement("div");

            trackElement.className = "track-card";
            trackElement.style.cursor = "pointer";

            trackElement.addEventListener("click", () => {
                window.open(track.external_urls.spotify, "_blank");
            });

            trackElement.innerHTML = `
                <img
                    src="${track.album.images[0]?.url || ""}"
                    alt="${track.album.name}"
                >

                <div class="track-info">
                    <span>#${index + 1}</span>
                    <h3>${track.name}</h3>
                    <p>
                        ${track.artists.map(artist => artist.name).join(", ")}
                    </p>
                </div>
            `;

            container.appendChild(trackElement);
        });

    } catch (error) {
        console.error(error);

        container.innerHTML =
            "<p>No se pudo cargar tu actividad reciente.</p>";
    }
}

loadRecentlyPlayed();

async function loadSpotifyProfile() {
        const token = sessionStorage.getItem(
        getAccessTokenKey()
    );
    const container = document.getElementById("spotify-profile");

    if (!token || !container) {
        return;
    }

    try {
        const response = await spotifyFetch(
            "https://api.spotify.com/v1/me"
        );

        if (!response.ok) {
            throw new Error("No se pudo obtener tu perfil.");
        }

        const profile = await response.json();

        container.innerHTML = `
            <div class="spotify-profile-card">
                <img
                    src="${profile.images?.[0]?.url || ""}"
                    alt="Foto de perfil"
                >

                <div>
                    <span>USUARIO</span>
                    <h3>${profile.display_name || "Usuario de Spotify"}</h3>
                </div>
            </div>
        `;

    } catch (error) {
        console.error(error);

        container.innerHTML =
            "<p>No se pudo cargar tu perfil.</p>";
    }
}

loadSpotifyProfile();