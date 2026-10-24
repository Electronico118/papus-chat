const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const { Server } = require("socket.io");
const multer = require("multer");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");
const PERFILES_FILE = path.join(__dirname, "perfiles.json");
const UPLOADS_DIR = path.join(__dirname, "uploads");
const MAX_FILE_BYTES = 5 * 1024 * 1024 * 1024;
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (_req, file, cb) => {
        const original = path.basename(file.originalname || "archivo");
        const safe = original.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-150) || "archivo";
        cb(null, `${Date.now()}-${crypto.randomBytes(6).toString("hex")}-${safe}`);
    }
});
const upload = multer({ storage, limits: { fileSize: MAX_FILE_BYTES } });

app.use(express.json({ limit: "5mb" }));
app.use(express.static(PUBLIC_DIR));
app.use("/uploads", express.static(UPLOADS_DIR, {
    setHeaders: res => res.setHeader("X-Content-Type-Options", "nosniff")
}));

app.post("/upload", (req, res) => {
    upload.single("file")(req, res, (error) => {
        if (error) {
            console.error("Error de subida:", error);
            if (error.code === "LIMIT_FILE_SIZE") {
                return res.status(413).json({ error: "El límite es de 5 GB por archivo." });
            }
            return res.status(400).json({ error: error.message || "No se ha podido subir el archivo." });
        }
        if (!req.file) return res.status(400).json({ error: "No se ha recibido ningún archivo." });
        return res.json({
            nombre: req.file.originalname,
            url: `/uploads/${encodeURIComponent(req.file.filename)}`,
            tipo: req.file.mimetype || "application/octet-stream",
            tamaño: req.file.size
        });
    });
});

app.get("/", (req, res) => {
    res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

// Cargar perfiles guardados
let perfiles = {};

try {
    if (fs.existsSync(PERFILES_FILE)) {
        perfiles = JSON.parse(fs.readFileSync(PERFILES_FILE, "utf8"));
    }
} catch (error) {
    console.error("Error leyendo perfiles.json:", error);
    perfiles = {};
}

function guardarPerfiles() {
    try {
        fs.writeFileSync(
            PERFILES_FILE,
            JSON.stringify(perfiles, null, 2),
            "utf8"
        );
    } catch (error) {
        console.error("Error guardando perfiles:", error);
    }
}

const usuariosConectados = new Map();
const clavesCliente = new Map();
const mensajes = [];
const temporizadoresEscritura = new Map();
const participantesLlamada = new Set();

function obtenerPerfil(nombre) {
    return perfiles[nombre] || {};
}

// Obtener usuarios conectados con su foto
function obtenerUsuarios() {
    return Array.from(usuariosConectados.entries()).map(([id, usuario]) => {
        const perfil = obtenerPerfil(usuario.nombre);
        const foto = perfil.foto || perfil.avatar || "";

        return {
            id,
            nombre: usuario.nombre,
            foto,
            avatar: foto
        };
    });
}

function emitirListaUsuarios() {
    io.emit("user-list", obtenerUsuarios());
}

function emitirParticipantesLlamada() {
    const participantes = Array.from(participantesLlamada)
        .filter(id => usuariosConectados.has(id))
        .map(id => {
            const usuario = usuariosConectados.get(id);
            const perfil = obtenerPerfil(usuario.nombre);
            const foto = perfil.foto || perfil.avatar || "";

            return {
                id,
                nombre: usuario.nombre,
                foto,
                avatar: foto,
                microfonoSilenciado: usuario.microfonoSilenciado || false,
                altavozSilenciado: usuario.altavozSilenciado || false
            };
        });

    io.emit("call-participants", participantes);
}

function detenerEscritura(id) {
    const temporizador = temporizadoresEscritura.get(id);

    if (temporizador) {
        clearTimeout(temporizador);
        temporizadoresEscritura.delete(id);
    }

    io.emit("user-stop-typing", id);
}

io.on("connection", socket => {
    console.log("Conectado:", socket.id);

    socket.emit("historial", mensajes);
    socket.emit("profiles-loaded", perfiles);

    socket.on("set-client-key", key => {
        if (typeof key !== "string" || key.length < 8 || key.length > 150) return;
        clavesCliente.set(socket.id, key);
    });

    socket.on("set-username", nombre => {
        if (typeof nombre !== "string") return;

        nombre = nombre.trim().slice(0, 20);
        if (!nombre) return;

        const usuarioAnterior = usuariosConectados.get(socket.id);

        usuariosConectados.set(socket.id, {
            nombre,
            microfonoSilenciado: usuarioAnterior?.microfonoSilenciado || false,
            altavozSilenciado: usuarioAnterior?.altavozSilenciado || false
        });

        emitirListaUsuarios();
        emitirParticipantesLlamada();
    });

    // Guardar y actualizar la foto de perfil
    socket.on("set-profile-photo", data => {
        const usuario = usuariosConectados.get(socket.id);

        if (!usuario || !data || typeof data.foto !== "string") {
            return;
        }

        const foto = data.foto;

        if (
            foto &&
            !/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(foto)
        ) {
            socket.emit(
                "profile-photo-error",
                "Formato de imagen no válido."
            );
            return;
        }

        if (foto.length > 3500000) {
            socket.emit(
                "profile-photo-error",
                "La imagen es demasiado grande."
            );
            return;
        }

        if (foto) {
            perfiles[usuario.nombre] = {
                ...(perfiles[usuario.nombre] || {}),
                foto,
                avatar: foto
            };
        } else if (perfiles[usuario.nombre]) {
            delete perfiles[usuario.nombre].foto;
            delete perfiles[usuario.nombre].avatar;

            if (Object.keys(perfiles[usuario.nombre]).length === 0) {
                delete perfiles[usuario.nombre];
            }
        }

        guardarPerfiles();

        // Actualizar la lista de usuarios de todos los clientes
        emitirListaUsuarios();
        emitirParticipantesLlamada();

        io.emit("profile-photo-updated", {
            id: socket.id,
            nombre: usuario.nombre,
            foto: foto || "",
            avatar: foto || ""
        });
    });

    // Escritura
    socket.on("typing", () => {
        const usuario = usuariosConectados.get(socket.id);
        if (!usuario) return;

        const anterior = temporizadoresEscritura.get(socket.id);
        if (anterior) clearTimeout(anterior);

        temporizadoresEscritura.set(
            socket.id,
            setTimeout(() => detenerEscritura(socket.id), 2500)
        );

        socket.broadcast.emit("user-typing", {
            id: socket.id,
            nombre: usuario.nombre
        });
    });

    socket.on("stop-typing", () => detenerEscritura(socket.id));

    // Mensajes
    socket.on("chat-message", texto => {
        // La clave del cliente se registra desde el navegador antes de enviar cada mensaje.
        if (typeof texto !== "string" || !texto.trim()) return;

        detenerEscritura(socket.id);

        const usuario = usuariosConectados.get(socket.id);
        const nombre = usuario?.nombre || "Usuario";
        const perfil = obtenerPerfil(nombre);
        const foto = perfil.foto || perfil.avatar || "";

        const mensaje = {
            id: crypto.randomUUID(),
            ownerKey: clavesCliente.get(socket.id) || "",
            usuario: nombre,
            texto: texto.trim(),
            foto,
            avatar: foto,
            fecha: Date.now()
        };

        mensajes.push(mensaje);
        if (mensajes.length > 500) mensajes.shift();

        io.emit("chat-message", mensaje);
    });

    socket.on("delete-message", messageId => {
        if (typeof messageId !== "string") return;
        const ownerKey = clavesCliente.get(socket.id);
        const usuarioActual = usuariosConectados.get(socket.id)?.nombre;
        if (!ownerKey || !usuarioActual) return;
        const index = mensajes.findIndex(message => message.id === messageId);
        if (index === -1) return;
        const mensaje = mensajes[index];
        // Los mensajes nuevos se validan por clave única. Los antiguos sin ownerKey
        // pueden borrarse solo por una sesión con el mismo nombre de autor.
        const esPropio = mensaje.ownerKey
            ? mensaje.ownerKey === ownerKey
            : mensaje.usuario === usuarioActual;
        if (!esPropio) return;
        mensajes.splice(index, 1);
        io.emit("message-deleted", messageId);
    });

    socket.on("chat-attachment", data => {
        // Los adjuntos también quedan asociados a la clave del cliente para permitir su borrado.
        if (!data || typeof data.nombre !== "string" || typeof data.url !== "string" || !data.url.startsWith("/uploads/")) return;
        const usuario = usuariosConectados.get(socket.id);
        const nombre = usuario?.nombre || "Usuario";
        const perfil = obtenerPerfil(nombre);
        const foto = perfil.foto || perfil.avatar || "";
        const adjunto = {
            nombre: path.basename(data.nombre).slice(0, 255),
            url: data.url,
            tipo: typeof data.tipo === "string" ? data.tipo.slice(0, 120) : "application/octet-stream",
            tamaño: Number.isFinite(Number(data.tamaño)) ? Number(data.tamaño) : 0
        };
        const mensaje = {
            id: crypto.randomUUID(),
            ownerKey: clavesCliente.get(socket.id) || "",
            usuario: nombre, texto: "", foto, avatar: foto, adjunto, fecha: Date.now()
        };
        mensajes.push(mensaje);
        if (mensajes.length > 500) mensajes.shift();
        io.emit("chat-message", mensaje);
    });

    // Entrar en la llamada
    socket.on("join-call", () => {
        if (!usuariosConectados.has(socket.id)) return;

        participantesLlamada.add(socket.id);
        emitirParticipantesLlamada();
    });

    // Salir de la llamada
    socket.on("leave-call", () => {
        participantesLlamada.delete(socket.id);
        emitirParticipantesLlamada();
    });

    // Estado del micrófono y altavoz
    socket.on("call-device-state", estado => {
        const usuario = usuariosConectados.get(socket.id);
        if (!usuario || !estado) return;

        if (typeof estado.microfonoSilenciado === "boolean") {
            usuario.microfonoSilenciado = estado.microfonoSilenciado;
        }

        if (typeof estado.altavozSilenciado === "boolean") {
            usuario.altavozSilenciado = estado.altavozSilenciado;
        }

        emitirParticipantesLlamada();
    });

    socket.on("disconnect", () => {
        detenerEscritura(socket.id);

        usuariosConectados.delete(socket.id);
        clavesCliente.delete(socket.id);
        participantesLlamada.delete(socket.id);

        emitirListaUsuarios();
        emitirParticipantesLlamada();

        console.log("Desconectado:", socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`Papus Chat funcionando en http://localhost:${PORT}`);
});
