"use strict";

/**
 * French server-side catalog. Same key tree and {placeholders} as en.js
 * (backend/i18n/backendI18n.selftest.cjs). "tu" address, like the app.
 */
module.exports = {
  email: {
    email_verify_signup: {
      subject: "{code} est ton code de vérification Descall",
      eyebrow: "Vérification de l'e-mail",
      title: "Bienvenue sur Descall, {name} !",
      titleNoName: "Bienvenue sur Descall !",
      intro: "Ton compte est prêt. Une dernière étape : saisis le code ci-dessous dans l'appli pour vérifier ton adresse e-mail.",
      preheader: "Ton code : {code} · valable {minutes, plural, one {# minute} other {# minutes}}",
      ignore: "Si tu n'as pas créé ce compte, tu peux ignorer cet e-mail. L'adresse n'est liée à aucun compte tant qu'elle n'est pas vérifiée.",
    },
    email_verify: {
      subject: "{code} est ton code de vérification Descall",
      eyebrow: "Vérification de l'e-mail",
      title: "Vérifie ton adresse e-mail",
      intro: "Saisis le code ci-dessous dans l'appli pour ajouter cette adresse e-mail à ton compte Descall.",
      preheader: "Ton code : {code} · valable {minutes, plural, one {# minute} other {# minutes}}",
      ignore: "Si tu n'as rien demandé, tu peux ignorer cet e-mail. Ton adresse ne sera ajoutée à aucun compte.",
    },
    "2fa_login": {
      subject: "{code} est ton code de connexion Descall",
      eyebrow: "Code de connexion",
      codeLabel: "Ton code de connexion",
      title: "Termine ta connexion",
      intro: "Saisis ce code dans Descall pour te connecter à ton compte.",
      preheader: "Ton code de connexion : {code} · valable {minutes, plural, one {# minute} other {# minutes}}",
      ignore: "Si ce n'était pas toi, quelqu'un connaît peut-être ton mot de passe. Change-le tout de suite et active l'appli d'authentification dans Paramètres › Sécurité.",
    },
    email_reauth: {
      subject: "{code} est ton code de confirmation Descall",
      eyebrow: "Sécurité du compte",
      codeLabel: "Ton code de confirmation",
      title: "C'est bien toi ?",
      intro: "Saisis ce code pour changer l'adresse e-mail de ton compte.",
      preheader: "Ton code de confirmation : {code} · valable {minutes, plural, one {# minute} other {# minutes}}",
      ignore: "Si tu n'as rien demandé, ne partage pas le code et change ton mot de passe. L'adresse ne peut pas être modifiée sans lui.",
    },
    password_reset: {
      subject: "{code} est ton code de réinitialisation du mot de passe Descall",
      eyebrow: "Réinitialisation du mot de passe",
      codeLabel: "Ton code de réinitialisation",
      title: "Réinitialise ton mot de passe",
      intro: "Saisis ce code dans Descall pour choisir un nouveau mot de passe.",
      preheader: "Ton code de réinitialisation : {code} · valable {minutes, plural, one {# minute} other {# minutes}}",
      ignore: "Si tu n'as pas demandé à réinitialiser ton mot de passe, tu peux ignorer cet e-mail ; ton mot de passe reste le même.",
    },
    common: {
      hi: "Salut {name},",
      codeLabel: "Ton code",
      valid: "Valable {minutes, plural, one {# minute} other {# minutes}}",
      copyHint: "Tu peux sélectionner et copier le code.",
      never: "L'équipe Descall ne te demandera jamais ton code. Ne le partage avec personne.",
      nextTitle: "Et maintenant ?",
      step1Title: "Ajoute tes amis",
      step1Body: "Trouve-les par nom d'utilisateur ou partage ton lien d'invitation.",
      step2Title: "Rejoins un serveur",
      step2Body: "Rejoins une communauté ou crée la tienne en quelques secondes.",
      step3Title: "Commence à discuter",
      step3Body: "Envoie des messages, passe des appels vocaux et vidéo, partage ton écran.",
      getApp: "Descall te suit partout",
      appWin: "Télécharger pour Windows",
      appIos: "Télécharger dans l'App Store",
      appWeb: "Ouvrir dans le navigateur",
      help: "Besoin d'aide ?",
      write: "Écris-nous :",
      privacy: "Confidentialité",
      terms: "Conditions",
      why: "Tu reçois cet e-mail suite à une action sur ton compte Descall.",
      privacyPath: "/privacy",
      termsPath: "/terms",
      downloadPath: "/download",
      textCode: "Ton code",
      textValid: "Valable {minutes, plural, one {# minute} other {# minutes}}.",
    },
  },

  marketing: {
    subject: "Confirme les actus produit de Descall",
    text: "Ouvre ce lien pour confirmer que tu veux recevoir les notes produit de Descall. Si tu ne confirmes pas, nous ne t'enverrons pas d'e-mails.",
    htmlLead: "Ouvre le lien ci-dessous pour confirmer que tu veux recevoir les notes produit de Descall. Si tu ne confirmes pas, nous ne t'enverrons pas d'e-mails.",
    confirmLabel: "Confirmer l'abonnement",
    pageConfirm: "C'est confirmé. Tu peux te désabonner à tout moment.",
    pageGone: "Ce lien est invalide ou a déjà été utilisé.",
    pageUnsub: "Tu es désabonné. Nous ne t'enverrons plus d'e-mails produit.",
    unsubscribeAnyTime: "Désabonne-toi à tout moment :",
    goToSite: "Aller sur descall.com",
  },

  push: {
    someone: "Quelqu'un",
    newMessage: "Nouveau message",
    voice: "🎤 Message vocal",
    media: "📎 A envoyé une pièce jointe",
    photo: "📷 Photo",
    video: "🎬 Vidéo",
    group: "Groupe",
    mentioned: "{from} t'a mentionné",
    mentionedShort: "T'a mentionné",
    friendTitle: "Demande d'ami",
    friendBody: "{from} veut t'ajouter en ami",
    calling: "{from} t'appelle",
    voiceCall: "Appel vocal",
    videoCall: "Appel vidéo",
    groupCallTitle: "{groupName} — Appel de groupe",
    groupCallBody: "{from} a lancé un appel de groupe",
    ownerTitle: "Propriété du serveur",
    ownerBody: "Tu es maintenant propriétaire de {serverName}",
    ownerServerFallback: "le serveur",
    feedbackTitle: "L'équipe Descall a répondu",
    feedbackBody: "Ton retour a reçu une réponse",
    antibotTitle: "Alerte anti-bot",
    antibotBody: "{count, plural, one {# compte a dépassé} other {# comptes ont dépassé}} le seuil de risque (score max {topScore})",
    antibotWatchBody: "{count, plural, one {# nouvelle alerte de la liste de surveillance} other {# nouvelles alertes de la liste de surveillance}}",
    voicePlain: "Message vocal",
    attachmentPlain: "A envoyé une pièce jointe",
    incomingCall: "Appel entrant",
    incomingCallBody: "Quelqu'un t'appelle sur Descall",
    missedCallFrom: "Appel manqué : {name}",
    answeredElsewhere: "L'appel a été pris sur un autre appareil.",
    declinedElsewhere: "L'appel a été refusé sur un autre appareil.",
    missedCallBody: "Tu as manqué l'appel.",
    groupCall: "Appel de groupe",
    groupCallDefaultBody: "Quelqu'un a lancé un appel de groupe sur Descall",
    groupCallJoinVoice: "Rejoins l'appel vocal de ton groupe.",
    groupCallJoinVideo: "Rejoins l'appel vidéo de ton groupe.",
    messageRequestTitle: "Demande de message",
    messageRequestBody: "{from} t'a envoyé une demande de message",
  },

  maintenance: {
    emergencyTitle: "Maintenance d'urgence",
    plannedTitle: "Maintenance planifiée",
  },

  starter: {
    textCategory: "Salons textuels",
    text: "general",
    voiceCategory: "Salons vocaux",
    voice: "Lobby",
  },

  security: {
    passwordChangedSubject: "Ton mot de passe Descall a été modifié",
    passwordChangedBody: "Le mot de passe de ton compte Descall vient d'être modifié. Si ce n'était pas toi, contacte le support.",
    emailChangeSubject: "Changement d'e-mail Descall",
    emailChangeBody: "Une demande de changement de l'adresse e-mail de ton compte Descall a été faite. Si ce n'était pas toi, change ton mot de passe tout de suite et contacte le support.",
  },

  dataExport: {
    note: "Une copie des données personnelles que Descall conserve sur ce compte (RGPD, art. 15). Les messages que tu as envoyés sont inclus ; ceux que d'autres t'ont envoyés sont leurs données et n'y figurent pas. Les mots de passe, les secrets d'authentification à deux facteurs, les clés de session et de notifications push sont exclus pour des raisons de sécurité. Les données de prévention de la fraude et des abus ne sont pas communiquées afin qu'elles ne puissent pas être contournées. L'identité des personnes qui t'ont signalé n'est pas indiquée.",
    filePrefix: "descall-mes-donnees",
    accountFallback: "compte",
  },

  watch: {
    photo: "Photo",
    gif: "GIF",
    video: "Vidéo",
    voice: "Message vocal",
    file: "Fichier",
    poll: "Sondage",
    call: "Appel",
  },

  stats: {
    weekOf: "Semaine du {date}",
    sourceDirect: "Direct",
    sourceGoogleOrganic: "Google (organique)",
    sourceReferral: "Invitation d'un ami",
    other: "Autre",
    unknown: "Inconnu",
    csvPeriod: "periode",
    csvSignups: "inscriptions",
    csvAverage: "moyenne",
    csvFilePrefix: "stats-inscriptions",
  },

  // Server templates (lib/serverTemplates.js): written into the database in the creator's language.
  templates: {
    gaming: {
      name: "QG gaming",
      description: "Une config prête pour ton équipe : salon de recherche de coéquipiers, discussions de jeux, partage de clips, espace staff et salons vocaux ranked.",
      descriptionSeed: "Une communauté gaming : trouve des coéquipiers, partage tes clips et rejoins le vocal.",
      rulesText: "1) Sois respectueux.\n2) Pas de haine, de spam ni de NSFW en dehors des salons prévus.\n3) Annonces de recherche d'équipe claires (jeu + rang + région).\n4) Les décisions du staff sont définitives.\n5) Amuse-toi et joue fair-play.",
      highlights: ["Salon de recherche d'équipe", "Salon de clips", "Rôles du staff", "Vocal Lobby"],
      roles: ["Admin", "Modérateur", "Assistant", "VIP", "Membre"],
      categories: [
        {
          name: "Bienvenue",
          channels: [
            {
              name: "annonces",
              topic: "Actus officielles du serveur et notes de patch. Lecture seule pour les membres.",
            },
            {
              name: "regles",
              topic: "Règles du serveur : accepte-les avant de discuter dans les salons de la communauté.",
            },
            {
              name: "presentations",
              topic: "Dis bonjour : jeu, rang, région et ce à quoi tu joues.",
            },
          ],
        },
        {
          name: "Communauté",
          channels: [
            {
              name: "general",
              topic: "Le salon principal pour tout ce qui touche au gaming.",
            },
            {
              name: "recherche-equipe",
              topic: "Annonces de recherche d'équipe : jeu · rang · région · micro oui/non.",
            },
            {
              name: "clips-et-highlights",
              topic: "Partage tes meilleurs clips et captures d'écran.",
            },
            {
              name: "memes",
              topic: "Reste léger. Pas de harcèlement.",
            },
          ],
        },
        {
          name: "Salons vocaux",
          channels: [
            {
              name: "Lobby",
            },
            {
              name: "File duo",
            },
            {
              name: "Équipe de cinq",
            },
            {
              name: "AFK / Détente",
            },
            {
              name: "Scène du tournoi",
              topic: "Visionnages en groupe et briefings de tournoi.",
            },
          ],
        },
        {
          name: "Staff",
          channels: [
            {
              name: "staff-discussion",
              topic: "Coordination privée du staff.",
            },
            {
              name: "logs-moderation",
              topic: "Notes de modération et registre des dossiers.",
            },
            {
              name: "Vocal du staff",
            },
          ],
        },
      ],
    },
    friends: {
      name: "Repaire entre amis",
      description: "Un groupe privé et cosy : salon de discussion, plans, soirées musique et salons vocaux toujours ouverts.",
      descriptionSeed: "Un repaire privé entre amis : plans, memes et vocal tard le soir.",
      rulesText: "1) Pas de drama dans le groupe.\n2) Demande avant d'ajouter quelqu'un de nouveau.\n3) Ne divulgue pas les conversations privées.\n4) Coupe ton micro quand tu es AFK dans le vocal commun.\n5) Sois sympa, c'est notre espace.",
      highlights: ["Salon de discussion", "Tableau des plans", "Soirée musique", "Vocal toujours ouvert"],
      roles: ["Admin", "Co-hôte", "Meilleur pote", "Ami"],
      categories: [
        {
          name: "Accueil",
          channels: [
            {
              name: "salon",
              topic: "Discussion du quotidien, les memes sont bienvenus.",
            },
            {
              name: "plans",
              topic: "Sorties, visionnages en groupe, voyages.",
            },
            {
              name: "photos",
              topic: "Partage les photos de vos sorties et voyages.",
            },
            {
              name: "musique-et-liens",
              topic: "Playlists, TikToks et liens en vrac.",
            },
          ],
        },
        {
          name: "Vocal",
          channels: [
            {
              name: "Salon",
            },
            {
              name: "Nuit blanche",
            },
            {
              name: "Soirée visionnage",
            },
            {
              name: "Révise avec moi",
            },
          ],
        },
        {
          name: "Privé",
          channels: [
            {
              name: "hotes-uniquement",
              topic: "Organisation admin / co-hôtes.",
            },
          ],
        },
      ],
    },
    community: {
      name: "Communauté & créateurs",
      description: "Une communauté prête à ouvrir au public avec annonces, support, événements, salon de conférence et hiérarchie complète du staff.",
      descriptionSeed: "Une communauté pensée pour les créateurs : annonces, support et événements.",
      rulesText: "1) Respecte les conditions d'utilisation de Discord/Descall.\n2) Pas de spam, d'arnaques ni d'autopromo en dehors de #promo.\n3) Respecte tout le monde : tolérance zéro pour les discours de haine.\n4) Utilise le bon salon pour chaque sujet.\n5) Pour de l'aide, contacte le staff dans #support.",
      highlights: ["Annonces", "Service d'aide", "Événements", "Conférence"],
      roles: ["Équipe propriétaire", "Admin", "Modérateur", "Animateur d'événements", "Contributeur", "Membre"],
      categories: [
        {
          name: "Commence ici",
          channels: [
            {
              name: "annonces",
              topic: "Mises à jour officielles. Les membres ne peuvent pas publier ici.",
            },
            {
              name: "regles",
              topic: "Règles de la communauté.",
            },
            {
              name: "bienvenue",
              topic: "Les nouveaux membres se présentent ici.",
            },
            {
              name: "roles",
              topic: "Demande des rôles d'intérêt / des tags de contributeur.",
            },
          ],
        },
        {
          name: "Communauté",
          channels: [
            {
              name: "general",
              topic: "Discussion principale.",
            },
            {
              name: "support",
              topic: "Besoin d'aide ? Le staff répond ici.",
            },
            {
              name: "evenements",
              topic: "Événements à venir et inscriptions.",
            },
            {
              name: "promo",
              topic: "L'autopromo est autorisée ici uniquement : un post par jour.",
            },
            {
              name: "vitrine",
              topic: "Partage tes créations, tes streams et tes réussites.",
            },
          ],
        },
        {
          name: "Vocal & conférence",
          channels: [
            {
              name: "Salon de la communauté",
            },
            {
              name: "Salle de collab",
            },
            {
              name: "Assemblée générale",
              topic: "Sessions questions-réponses, annonces et événements en direct.",
            },
          ],
        },
        {
          name: "Staff",
          channels: [
            {
              name: "staff-discussion",
              topic: "Discussion interne du staff.",
            },
            {
              name: "file-moderation",
              topic: "Signalements et dossiers de modération ouverts.",
            },
            {
              name: "Vocal du staff",
            },
          ],
        },
      ],
    },
    study: {
      name: "Études & campus",
      description: "Salles de concentration, salons par matière, aide aux devoirs, vocal silencieux et rôles de mentor pour ta promo.",
      descriptionSeed: "Réviser ensemble : sessions de concentration, aide aux devoirs et discussions du campus.",
      rulesText: "1) Pas de distractions dans les salles d'étude.\n2) Pas de triche ni de fuite de sujets d'examen.\n3) Partage les ressources en citant leur source.\n4) Utilise les salons par matière pour l'aide liée au sujet.\n5) Sois bienveillant : chacun apprend à son rythme.",
      highlights: ["Salles de concentration", "Aide aux devoirs", "Vocal silencieux", "Rôle de mentor"],
      roles: ["Admin", "Modérateur", "Mentor", "Binôme de révision", "Étudiant"],
      categories: [
        {
          name: "Campus",
          channels: [
            {
              name: "annonces",
              topic: "Échéances, sessions et actus du campus.",
            },
            {
              name: "regles",
              topic: "Règles de la communauté d'étude.",
            },
            {
              name: "presentations",
              topic: "Filière, année et ce que tu étudies.",
            },
          ],
        },
        {
          name: "Études",
          channels: [
            {
              name: "general",
              topic: "Discussions du campus hors sujet.",
            },
            {
              name: "aide-aux-devoirs",
              topic: "Pose tes questions et montre ton travail.",
            },
            {
              name: "ressources",
              topic: "Notes, liens et fiches de révision.",
            },
            {
              name: "objectifs",
              topic: "Objectifs du jour et points d'étape.",
            },
          ],
        },
        {
          name: "Vocal concentration",
          channels: [
            {
              name: "Concentration silencieuse",
            },
            {
              name: "Salle Pomodoro",
            },
            {
              name: "Projet de groupe A",
            },
            {
              name: "Projet de groupe B",
            },
            {
              name: "Permanence",
              topic: "Sessions de questions-réponses animées par les mentors.",
            },
          ],
        },
        {
          name: "Staff",
          channels: [
            {
              name: "salle-des-mentors",
              topic: "Les mentors et les modos organisent les sessions d'aide.",
            },
          ],
        },
      ],
    },
    streaming: {
      name: "Streamer & contenu",
      description: "Alertes de live, coffre à clips, tableau des collabs, salon VIP et rôles modo/VIP pour les équipes de créateurs.",
      descriptionSeed: "Le QG du créateur : alertes de live, clips, collabs et avantages VIP.",
      rulesText: "1) Soutiens le créateur : pas de spoil des streams.\n2) Pas de spoilers dans #chat-live pendant les VOD.\n3) Autopromo uniquement dans #collabs.\n4) Les VIP donnent le ton : n'abuse pas des avantages.\n5) Les modos font respecter les règles du chat pendant le live.",
      highlights: ["Salon des lives", "Coffre à clips", "Salon VIP", "Équipe de modération"],
      roles: ["Créateur", "Modérateur", "Monteur", "VIP", "Abonné", "Spectateur"],
      categories: [
        {
          name: "Diffusion",
          channels: [
            {
              name: "annonces",
              topic: "Planning et grosses sorties.",
            },
            {
              name: "en-live",
              topic: "Notifications de live uniquement.",
            },
            {
              name: "regles",
              topic: "Règles du chat pour les streams et les VOD.",
            },
          ],
        },
        {
          name: "Communauté",
          channels: [
            {
              name: "general",
              topic: "Traîne avec la communauté.",
            },
            {
              name: "chat-live",
              topic: "Actif pendant les streams : pas de spoilers.",
            },
            {
              name: "clips",
              topic: "Les meilleurs moments des streams.",
            },
            {
              name: "collabs",
              topic: "Demandes de collab et shoutouts.",
            },
            {
              name: "suggestions",
              topic: "Idées de contenu pour le créateur.",
            },
          ],
        },
        {
          name: "VIP",
          channels: [
            {
              name: "salon-vip",
              topic: "Discussion avantages pour les VIP / Abonnés.",
            },
            {
              name: "Vocal VIP",
            },
          ],
        },
        {
          name: "Vocal",
          channels: [
            {
              name: "Salle d'attente",
            },
            {
              name: "Vocal collab",
            },
            {
              name: "After",
              topic: "Moments détente et questions-réponses après le stream.",
            },
          ],
        },
        {
          name: "Équipe",
          channels: [
            {
              name: "modos-discussion",
              topic: "Modération pendant le live.",
            },
            {
              name: "Vocal de l'équipe",
            },
          ],
        },
      ],
    },
  },
};
