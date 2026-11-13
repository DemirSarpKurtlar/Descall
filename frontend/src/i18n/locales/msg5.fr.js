/** Messaging phase 5 ("msg5.*"): role / @everyone / @here mentions, push previews,
 * scheduled sending with one attachment. Same keys in every msg5.<locale>.js. */
export const MSG5_FR = {
  roles: {
    section: "Rôles",
    subRole: "Rôle · ses membres sont notifiés",
    subRoleAdmin: "Rôle · seuls les admins peuvent le mentionner",
    subEveryone: "Notifie tous ceux qui voient ce salon",
    subHere: "Notifie les personnes en ligne en ce moment",
    unknown: "rôle inconnu",
    aria: "Rôle : {name}",
    popover: "Rôle · {name}",
    everyoneCooldown: "Tu pourras utiliser @everyone ou @here à nouveau dans {wait} s.",
  },
  preview: {
    settingDesc: "Désactivé : les notifications de l'app, du navigateur et du téléphone affichent seulement « Nouveau message » au lieu du texte.",
    saveError: "Enregistrement impossible. Réessaie dans un instant.",
  },
  schedule: {
    addAttachment: "Ajouter un fichier",
    attachmentHint: "Une photo ou un fichier, jusqu'à 100 Mo",
    attachment: "Pièce jointe",
    attachmentKept: "La pièce jointe reste ; tu peux changer le texte et l'heure.",
    removeAttachment: "Retirer la pièce jointe",
    errAttachment: "Ce fichier ne peut pas être programmé. Choisis une photo, une vidéo ou un document.",
    errTooLarge: "Le fichier est trop volumineux. 100 Mo maximum.",
    errAttachNotReady: "La programmation avec fichier n'est pas encore active sur le serveur. Retire le fichier pour programmer seulement le texte.",
    errUpload: "Le fichier n'a pas pu être envoyé. Vérifie ta connexion et réessaie.",
  },
  reengage: {
    friendVoice: "Un ami est en vocal",
    friendVoiceDesc: "Une notification quand un ami rejoint un salon vocal que tu peux rejoindre pendant ton absence. Quelques-unes par jour au plus, jamais la nuit.",
    email: "Notifications par e-mail",
    emailDesc: "Des e-mails sur les demandes d'ami et invitations manquées, et quelques conseils pour les nouveaux comptes.",
  },
  media: {
    imageFailed: "Impossible de charger l'image",
    videoFailed: "Impossible de charger la vidéo",
  },
};
