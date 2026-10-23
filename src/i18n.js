// -----------------------------------------------------------------------------
// Runtime texts (English and French): feature and option names, the status of
// the integration, the answers of the buttons and the command errors.
// -----------------------------------------------------------------------------

import { FEATURES } from './constants.js';

const both = (en, fr) => ({ en, fr });
export { both };

/** One language of a `{ en, fr }` text. */
export const word = (value, language) => (language === 'en' ? value.en : value.fr);

/** Two texts one after the other, in both languages. */
export const join = (a, b) => both(`${a.en} ${b.en}`, `${a.fr} ${b.fr}`);

/** "45 s", "5 min", "2 h", in both languages. */
export function age(ms) {
  const seconds = Math.max(1, Math.round(ms / 1000));
  if (seconds < 90) {
    return both(`${seconds} s`, `${seconds} s`);
  }
  const minutes = Math.round(seconds / 60);
  if (minutes < 90) {
    return both(`${minutes} min`, `${minutes} min`);
  }
  const hours = Math.round(minutes / 60);
  return both(`${hours} h`, `${hours} h`);
}

export const DEVICE_NAME = both('Flexit Nordic ventilation', 'Ventilation Flexit Nordic');

export const FEATURE_NAMES = {
  [FEATURES.OPERATION_MODE]: both('Operation mode', 'Mode de fonctionnement'),
  [FEATURES.VENTILATION_MODE]: both('Ventilation mode', 'Mode de ventilation'),
  [FEATURES.SETPOINT_HOME]: both(
    'Air temperature setpoint, Home (°C)',
    'Consigne de température d’air, Maison (°C)',
  ),
  [FEATURES.SETPOINT_AWAY]: both(
    'Air temperature setpoint, Away (°C)',
    'Consigne de température d’air, Absence (°C)',
  ),
  [FEATURES.COMFORT]: both('Comfort button', 'Bouton confort'),
  [FEATURES.HEATER]: both('Electric heater enabled', 'Batterie électrique activée'),
  [FEATURES.COOKER_HOOD]: both('Cooker hood mode', 'Mode hotte'),
  [FEATURES.FIREPLACE]: both('Fireplace mode', 'Mode cheminée'),
  [FEATURES.FILTER_POLLUTED]: both('Filter to replace', 'Filtre à remplacer'),
  [FEATURES.TEMP_OUTDOOR]: both('Outdoor air temperature', 'Température de l’air extérieur'),
  [FEATURES.TEMP_SUPPLY]: both('Supply air temperature', 'Température de l’air soufflé'),
  [FEATURES.TEMP_EXTRACT]: both('Extract air temperature', 'Température de l’air extrait'),
  [FEATURES.TEMP_EXHAUST]: both('Exhaust air temperature', 'Température de l’air rejeté'),
  [FEATURES.TEMP_ROOM]: both('Room temperature (CI70 panel)', 'Température de la pièce (CI70)'),
  [FEATURES.TEMP_SETPOINT_HOME]: both(
    'Air temperature setpoint, Home',
    'Consigne de température, Maison',
  ),
  [FEATURES.TEMP_SETPOINT_AWAY]: both(
    'Air temperature setpoint, Away',
    'Consigne de température, Absence',
  ),
  [FEATURES.HUMIDITY_EXTRACT]: both('Extract air humidity', 'Humidité de l’air extrait'),
  [FEATURES.HUMIDITY_ROOM_1]: both('Room humidity 1 (CI77)', 'Humidité pièce 1 (CI77)'),
  [FEATURES.HUMIDITY_ROOM_2]: both('Room humidity 2 (CI77)', 'Humidité pièce 2 (CI77)'),
  [FEATURES.HUMIDITY_ROOM_3]: both('Room humidity 3 (CI77)', 'Humidité pièce 3 (CI77)'),
  [FEATURES.SUPPLY_FAN]: both('Supply fan', 'Ventilateur de soufflage'),
  [FEATURES.EXHAUST_FAN]: both('Exhaust fan', 'Ventilateur d’extraction'),
  [FEATURES.SUPPLY_RPM]: both(
    'Supply fan speed (rpm)',
    'Vitesse du ventilateur de soufflage (tr/min)',
  ),
  [FEATURES.EXHAUST_RPM]: both(
    'Exhaust fan speed (rpm)',
    'Vitesse du ventilateur d’extraction (tr/min)',
  ),
  [FEATURES.EXCHANGER_SPEED]: both(
    'Heat exchanger speed (%)',
    'Vitesse de l’échangeur de chaleur (%)',
  ),
  [FEATURES.EXCHANGER_EFFICIENCY]: both(
    'Heat exchanger efficiency (%)',
    'Rendement de l’échangeur de chaleur (%)',
  ),
  [FEATURES.HEATER_POWER]: both('Electric heater power', 'Puissance de la batterie électrique'),
  [FEATURES.FIREPLACE_REMAINING]: both(
    'Fireplace mode, time remaining',
    'Mode cheminée, temps restant',
  ),
  [FEATURES.RAPID_REMAINING]: both(
    'Rapid ventilation, time remaining',
    'Ventilation rapide, temps restant',
  ),
  [FEATURES.FIREPLACE_RUNTIME]: both('Fireplace mode duration', 'Durée du mode cheminée'),
  [FEATURES.RAPID_RUNTIME]: both('Rapid ventilation duration', 'Durée de la ventilation rapide'),
  [FEATURES.FILTER_HOURS]: both('Filter operating time', 'Durée d’utilisation du filtre'),
  [FEATURES.FILTER_INTERVAL]: both(
    'Filter exchange interval',
    'Intervalle de changement du filtre',
  ),
  [FEATURES.RAPID_START]: both('Start rapid ventilation', 'Démarrer la ventilation rapide'),
  [FEATURES.FIREPLACE_START]: both('Start the fireplace mode', 'Démarrer le mode cheminée'),
  [FEATURES.FIREPLACE_STOP]: both('Stop the fireplace mode', 'Arrêter le mode cheminée'),
  [FEATURES.COOKER_HOOD_ON]: both('Cooker hood mode on', 'Activer le mode hotte'),
  [FEATURES.COOKER_HOOD_OFF]: both('Cooker hood mode off', 'Désactiver le mode hotte'),
  [FEATURES.HEATER_ON]: both('Enable the electric heater', 'Activer la batterie électrique'),
  [FEATURES.HEATER_OFF]: both('Disable the electric heater', 'Désactiver la batterie électrique'),
  [FEATURES.COMFORT_ON]: both('Comfort button on', 'Activer le bouton confort'),
  [FEATURES.COMFORT_OFF]: both('Comfort button off', 'Désactiver le bouton confort'),
  [FEATURES.FILTER_RESET]: both('Reset the filter timer', 'Remettre à zéro le compteur du filtre'),
};

export const MODE_NAMES = {
  away: both('Away', 'Absence'),
  home: both('Home', 'Maison'),
  high: both('High', 'Fort'),
};

export const SETPOINT_NAME = (value) => both(`${value} °C`, `${value.replace('.', ',')} °C`);

/** The operation modes as the status says them. */
const OPERATION_NAMES = {
  off: both('stopped', 'arrêtée'),
  away: both('away', 'absence'),
  home: both('home', 'maison'),
  high: both('high', 'fort'),
  'cooker-hood': both('cooker hood', 'hotte'),
  fireplace: both('fireplace', 'cheminée'),
  'temporary-high': both('rapid ventilation', 'ventilation rapide'),
};

/** The integration status and the answers of the buttons. */
export const T = {
  noHost: both(
    'Enter the IP address of your Flexit Nordic unit, then save.',
    'Saisissez l’adresse IP de votre centrale Flexit Nordic, puis enregistrez.',
  ),
  invalid: (typed) =>
    both(
      `Invalid configuration: ${typed} (an IPv4 address, optionally with a port, and a device id from 0 to 4194302).`,
      `Configuration invalide : ${typed} (une adresse IPv4, avec un port si besoin, et un numéro d’appareil de 0 à 4194302).`,
    ),
  connecting: both('Reading the unit…', 'Lecture de la centrale…'),
  waiting: (wait) =>
    both(
      `Next read of the unit in ${wait.en} (never sooner than the refresh interval).`,
      `Prochaine lecture de la centrale dans ${wait.fr} (jamais avant l’intervalle de rafraîchissement).`,
    ),
  lastRead: (ago) => both(`Last read ${ago.en} ago.`, `Dernière lecture il y a ${ago.fr}.`),
  connected: (summary) => both(`Connected. ${summary.en}`, `Connecté. ${summary.fr}`),
  unreachable: (address, deviceId, wait) =>
    both(
      `No answer from ${address} (BACnet device ${deviceId}; next try in ${wait.en}). Check the address, that BACnet is enabled on the unit and the device id (2 unless changed).`,
      `Pas de réponse de ${address} (appareil BACnet ${deviceId} ; nouvel essai dans ${wait.fr}). Vérifiez l’adresse, que BACnet est activé sur la centrale et le numéro d’appareil (2 sauf modification).`,
    ),
  failing: (reason, wait) =>
    both(
      `The unit answered badly (${reason}); next try in ${wait.en}.`,
      `La centrale a mal répondu (${reason}) ; nouvel essai dans ${wait.fr}.`,
    ),
  otherUnit: (found, expected) =>
    both(
      `Another unit answers at this address (serial ${found}; this integration drives ${expected}). Nothing of it is shown and the commands are refused. If you replaced the unit, press "Accept the unit at this address" twice.`,
      `Une autre centrale répond à cette adresse (numéro de série ${found} ; cette intégration pilote ${expected}). Rien n’en est affiché et les commandes sont refusées. Si vous avez remplacé la centrale, appuyez deux fois sur « Accepter la centrale à cette adresse ».`,
    ),
  acceptNothing: both(
    'Nothing to accept: the unit at this address is the one this integration drives.',
    'Rien à accepter : la centrale à cette adresse est celle que pilote cette intégration.',
  ),
  acceptConfirm: (serial) =>
    both(
      `The unit with serial ${serial} answers at this address. Press "Accept the unit at this address" again within 2 minutes to drive it (the Gladys device and its history stay).`,
      `La centrale de numéro de série ${serial} répond à cette adresse. Appuyez de nouveau sur « Accepter la centrale à cette adresse » dans les 2 minutes pour la piloter (l’appareil Gladys et son historique restent).`,
    ),
  accepted: (serial) =>
    both(
      `Unit ${serial} accepted: it is shown from the next read.`,
      `Centrale ${serial} acceptée : elle est affichée dès la prochaine lecture.`,
    ),
  summary: (values, model) => {
    const name = model ? `Flexit Nordic ${model}` : 'Flexit Nordic';
    const mode = OPERATION_NAMES[values.operationMode];
    if (!mode) {
      return both(`${name}: mode unknown.`, `${name} : mode inconnu.`);
    }
    if (values.operationMode === 'off') {
      return both(
        `${name}: unit stopped; Gladys does not restart it.`,
        `${name} : centrale arrêtée ; Gladys ne la relance pas.`,
      );
    }
    return both(`${name}: ${mode.en} mode.`, `${name} : mode ${mode.fr}.`);
  },
};

/** The errors a command answers to Gladys. */
export const ERRORS = {
  readOnly: both('This feature is read only.', 'Cette fonctionnalité est en lecture seule.'),
  badValue: both('Unknown value: not sent.', 'Valeur inconnue : non envoyée.'),
  badButton: both('A button only takes 1: not sent.', 'Un bouton ne prend que 1 : non envoyé.'),
  disabled: both(
    'Commands are disabled: turn on "Allow the commands" in the configuration of the integration.',
    'Les commandes sont désactivées : activez « Autoriser les commandes » dans la configuration de l’intégration.',
  ),
  noHost: both(
    'No valid address for the unit in the configuration: not sent.',
    'Aucune adresse valide de la centrale dans la configuration : non envoyée.',
  ),
  otherUnit: both(
    'Another unit answers at this address: command not sent (see the configuration of the integration).',
    'Une autre centrale répond à cette adresse : commande non envoyée (voir la configuration de l’intégration).',
  ),
  identityUnknown: both(
    'The serial number of the unit could not be read just before: command not sent.',
    'Le numéro de série de la centrale n’a pas pu être relu juste avant : commande non envoyée.',
  ),
  unitOff: both(
    'The unit is stopped: Gladys neither stops nor restarts it. Command not sent.',
    'La centrale est arrêtée : Gladys ne l’arrête ni ne la relance. Commande non envoyée.',
  ),
  configChanged: both(
    'The configuration changed meanwhile: not sent.',
    'La configuration a changé entre-temps : non envoyée.',
  ),
  busy: both(
    'Another command to the unit is still running: not sent.',
    'Une autre commande vers la centrale est encore en cours : non envoyée.',
  ),
  protectMeanwhile: both(
    'A protective command (heater off, cooker hood off, fireplace stop) was sent meanwhile: not sent.',
    'Une commande de protection (batterie coupée, hotte désactivée, arrêt cheminée) est partie entre-temps : non envoyée.',
  ),
  tooSlow: both(
    'The unit answered too slowly to send the command in time: not sent.',
    'La centrale a répondu trop lentement pour envoyer la commande à temps : non envoyée.',
  ),
  unknownState: (reason) =>
    both(
      `The state of the unit could not be read just before (${reason}): command not sent.`,
      `L’état de la centrale n’a pas pu être relu juste avant (${reason}) : commande non envoyée.`,
    ),
  unreadable: both('unreadable', 'illisible'),
  togglePending: both(
    'A previous command for this mode is not visible on the unit yet; sending another trigger now could undo it. Not sent: check in a few seconds.',
    'Une commande précédente pour ce mode n’est pas encore visible sur la centrale ; un nouveau déclenchement pourrait l’annuler. Non envoyée : vérifiez dans quelques secondes.',
  ),
  stopDeferred: both(
    'The fireplace mode start sent before is not visible yet: the stop is sent as soon as a read shows the mode on (within 2 minutes).',
    'Le démarrage du mode cheminée envoyé avant n’est pas encore visible : l’arrêt part dès qu’une lecture montre le mode actif (dans les 2 minutes).',
  ),
  refused: (detail) =>
    both(
      `The unit refused the command (${detail}): not applied.`,
      `La centrale a refusé la commande (${detail}) : non appliquée.`,
    ),
  notSent: (reason) =>
    both(
      `The unit could not be reached (${reason}): command not sent.`,
      `La centrale n’a pas pu être jointe (${reason}) : commande non envoyée.`,
    ),
  sentUnconfirmed: (reason) =>
    both(
      `Command sent, without confirmation (${reason}): check the state of the unit in a few seconds.`,
      `Commande envoyée, sans confirmation (${reason}) : vérifiez l’état de la centrale dans quelques secondes.`,
    ),
};
