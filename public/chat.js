/**
 * Marc — Assistant IA
 * Collège Saint-Pierre
 *
 * Gestion de l'interface du chat et communication avec Cloudflare Workers AI.
 */

// ===============================
// ÉLÉMENTS DE LA PAGE
// ===============================

const chatMessages = document.getElementById("chat-messages");
const userInput = document.getElementById("user-input");
const sendButton = document.getElementById("send-button");
const typingIndicator = document.getElementById("typing-indicator");

// ===============================
// HISTORIQUE DE LA CONVERSATION
// ===============================

let chatHistory = [
	{
		role: "assistant",
		content:
			"Bonjour 👋\n\nJe suis Marc, l'assistant IA officiel du Collège Saint-Pierre.\n\nJe peux vous aider avec les informations du collège, la vie scolaire et les services numériques.\n\nComment puis-je vous aider ?",
	},
];

let isProcessing = false;

// ===============================
// REDIMENSIONNEMENT DE LA ZONE DE TEXTE
// ===============================

userInput.addEventListener("input", function () {
	this.style.height = "auto";
	this.style.height = this.scrollHeight + "px";
});

// ===============================
// ENVOI AVEC LA TOUCHE ENTRÉE
// ===============================

userInput.addEventListener("keydown", function (event) {
	if (event.key === "Enter" && !event.shiftKey) {
		event.preventDefault();
		sendMessage();
	}
});

// ===============================
// BOUTON ENVOYER
// ===============================

sendButton.addEventListener("click", sendMessage);

// ===============================
// RECONNAISSANCE DES QUESTIONS
// SUR L'IDENTITÉ DE MARC
// ===============================

function questionIdentiteDeMarc(message) {
	const texte = message
		.toLowerCase()
		.trim()
		.replace(/[!?.,;:]+$/g, "");

	const questionsIdentite = [
		"ton nom",
		"ton prénom",
		"quel est ton nom",
		"quel est ton prénom",
		"comment tu t'appelles",
		"comment t'appelles tu",
		"comment t'appelles-tu",
		"tu t'appelles comment",
		"tu t'appelle comment",
		"qui es tu",
		"qui es-tu",
		"tu es qui",
		"c'est quoi ton nom",
		"c'est quoi ton prénom",
		"ton petit nom",
	];

	return questionsIdentite.includes(texte);
}

// ===============================
// RÉPONSE DIRECTE DE MARC
// ===============================

function reponseIdentite(message) {
	const texte = message
		.toLowerCase()
		.trim()
		.replace(/[!?.,;:]+$/g, "");

	if (
		texte === "ton nom" ||
		texte === "ton prénom" ||
		texte === "quel est ton nom" ||
		texte === "quel est ton prénom" ||
		texte === "comment tu t'appelles" ||
		texte === "comment t'appelles tu" ||
		texte === "comment t'appelles-tu" ||
		texte === "tu t'appelles comment" ||
		texte === "tu t'appelle comment" ||
		texte === "c'est quoi ton nom" ||
		texte === "c'est quoi ton prénom"
	) {
		return "Je m'appelle Marc.";
	}

	return "Je suis Marc, l'assistant IA officiel du Collège Saint-Pierre.";
}

// ===============================
// ENVOI D'UN MESSAGE
// ===============================

async function sendMessage() {
	const message = userInput.value.trim();

	// Ne rien faire si le message est vide
	if (message === "" || isProcessing) {
		return;
	}

	// Bloquer les contrôles pendant le traitement
	isProcessing = true;
	userInput.disabled = true;
	sendButton.disabled = true;

	// Afficher le message de l'utilisateur
	addMessageToChat("user", message);

	// Vider la zone de saisie
	userInput.value = "";
	userInput.style.height = "auto";

	// Faire défiler la conversation vers le bas
	scrollChatToBottom();

	// ============================================
	// RÉPONSE DIRECTE POUR L'IDENTITÉ DE MARC
	// ============================================

	if (questionIdentiteDeMarc(message)) {
		// Petit délai pour garder un fonctionnement naturel
		typingIndicator.classList.add("visible");

		await new Promise((resolve) => setTimeout(resolve, 300));

		typingIndicator.classList.remove("visible");

		const reponse = reponseIdentite(message);

		addMessageToChat("assistant", reponse);

		chatHistory.push({
			role: "user",
			content: message,
		});

		chatHistory.push({
			role: "assistant",
			content: reponse,
		});

		isProcessing = false;
		userInput.disabled = false;
		sendButton.disabled = false;
		userInput.focus();

		return;
	}

	// ============================================
	// CONVERSATION NORMALE AVEC L'IA
	// ============================================

	typingIndicator.classList.add("visible");

	chatHistory.push({
		role: "user",
		content: message,
	});

	try {
		// Créer la bulle de réponse de l'assistant
		const assistantMessageEl = document.createElement("div");
		assistantMessageEl.className = "message assistant-message";

		const assistantTextEl = document.createElement("p");

		assistantMessageEl.appendChild(assistantTextEl);
		chatMessages.appendChild(assistantMessageEl);

		scrollChatToBottom();

		// ============================================
		// APPEL À CLOUDFLARE WORKERS AI
		// ============================================

		const response = await fetch("/api/chat", {
			method: "POST",

			headers: {
				"Content-Type": "application/json",
			},

			body: JSON.stringify({
				messages: chatHistory,
			}),
		});

		// Vérification de la réponse
		if (!response.ok) {
			throw new Error(
				"Erreur lors de la communication avec l'assistant."
			);
		}

		if (!response.body) {
			throw new Error("La réponse du serveur est vide.");
		}

		// ============================================
		// LECTURE DE LA RÉPONSE EN STREAM
		// ============================================

		const reader = response.body.getReader();
		const decoder = new TextDecoder();

		let responseText = "";
		let buffer = "";
		let sawDone = false;

		const afficherReponse = () => {
			assistantTextEl.textContent = responseText;
			scrollChatToBottom();
		};

		while (true) {
			const { done, value } = await reader.read();

			// Fin du flux
			if (done) {
				const parsed = consumeSseEvents(buffer + "\n\n");

				for (const data of parsed.events) {
					if (data === "[DONE]") {
						break;
					}

					try {
						const jsonData = JSON.parse(data);

						let content = "";

						// Format Cloudflare Workers AI
						if (
							typeof jsonData.response === "string" &&
							jsonData.response.length > 0
						) {
							content = jsonData.response;
						}

						// Format compatible OpenAI
						else if (
							jsonData.choices?.[0]?.delta?.content
						) {
							content =
								jsonData.choices[0].delta.content;
						}

						if (content) {
							responseText += content;
							afficherReponse();
						}
					} catch (error) {
						console.error(
							"Erreur de lecture SSE :",
							error
						);
					}
				}

				break;
			}

			// Ajouter les données reçues au buffer
			buffer += decoder.decode(value, {
				stream: true,
			});

			const parsed = consumeSseEvents(buffer);

			buffer = parsed.buffer;

			for (const data of parsed.events) {
				if (data === "[DONE]") {
					sawDone = true;
					buffer = "";
					break;
				}

				try {
					const jsonData = JSON.parse(data);

					let content = "";

					// Format Cloudflare Workers AI
					if (
						typeof jsonData.response === "string" &&
						jsonData.response.length > 0
					) {
						content = jsonData.response;
					}

					// Format compatible OpenAI
					else if (
						jsonData.choices?.[0]?.delta?.content
					) {
						content =
							jsonData.choices[0].delta.content;
					}

					if (content) {
						responseText += content;
						afficherReponse();
					}
				} catch (error) {
					console.error(
						"Erreur de lecture SSE :",
						error
					);
				}
			}

			if (sawDone) {
				break;
			}
		}

		// Ajouter la réponse à l'historique
		if (responseText.length > 0) {
			chatHistory.push({
				role: "assistant",
				content: responseText,
			});
		}
	} catch (error) {
		console.error("Erreur :", error);

		addMessageToChat(
			"assistant",
			"Une erreur est survenue. Veuillez réessayer."
		);
	} finally {
		// Cacher l'indicateur de chargement
		typingIndicator.classList.remove("visible");

		// Réactiver les contrôles
		isProcessing = false;
		userInput.disabled = false;
		sendButton.disabled = false;

		userInput.focus();

		scrollChatToBottom();
	}
}

// ===============================
// AJOUTER UNE BULLE DE MESSAGE
// ===============================

function addMessageToChat(role, content) {
	const messageEl = document.createElement("div");

	messageEl.className = `message ${role}-message`;

	const textEl = document.createElement("p");

	// textContent évite d'interpréter du HTML envoyé par l'utilisateur
	textEl.textContent = content;

	messageEl.appendChild(textEl);

	chatMessages.appendChild(messageEl);

	scrollChatToBottom();
}

// ===============================
// FAIRE DÉFILER LA CONVERSATION
// ===============================

function scrollChatToBottom() {
	if (chatMessages) {
		chatMessages.scrollTop = chatMessages.scrollHeight;
	}
}

// ===============================
// LECTURE DES ÉVÉNEMENTS SSE
// ===============================

function consumeSseEvents(buffer) {
	let normalized = buffer.replace(/\r/g, "");

	const events = [];

	let eventEndIndex;

	while (
		(eventEndIndex = normalized.indexOf("\n\n")) !== -1
	) {
		const rawEvent = normalized.slice(
			0,
			eventEndIndex
		);

		normalized = normalized.slice(
			eventEndIndex + 2
		);

		const lines = rawEvent.split("\n");

		const dataLines = [];

		for (const line of lines) {
			if (line.startsWith("data:")) {
				dataLines.push(
					line.slice("data:".length).trimStart()
				);
			}
		}

		if (dataLines.length === 0) {
			continue;
		}

		events.push(dataLines.join("\n"));
	}

	return {
		events,
		buffer: normalized,
	};
}
