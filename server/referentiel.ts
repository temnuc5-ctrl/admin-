/**
 * Référentiel des emplacements de contrôle.
 * Sert de repli si la RPC `get_expected_locations` n'est pas déployée.
 */
export const LIEUX_REFERENTIEL: { secteur: string; unite: string; emplacement: string }[] = [
  { secteur: "LF", unite: "RF", emplacement: "Étage filtre" },
  { secteur: "LF", unite: "RF", emplacement: "RDC" },
  { secteur: "LF", unite: "CAP X-Y", emplacement: "1er étage" },
  { secteur: "LF", unite: "CAP X-Y", emplacement: "RDC" },
  { secteur: "LF", unite: "CAP Z", emplacement: "2ème étage" },
  { secteur: "LF", unite: "CAP Z", emplacement: "RDC" },
  { secteur: "LF", unite: "CAP V", emplacement: "2ème étage" },
  { secteur: "LF", unite: "CAP V", emplacement: "RDC" },
  { secteur: "LF", unite: "CAP T", emplacement: "2ème étage" },
  { secteur: "LF", unite: "CAP T", emplacement: "RDC" },
  { secteur: "LF", unite: "CAP U", emplacement: "2ème étage" },
  { secteur: "LF", unite: "CAP U", emplacement: "RDC" },
  { secteur: "LF", unite: "CAP W", emplacement: "2ème étage" },
  { secteur: "LF", unite: "CAP W", emplacement: "RDC" },
  { secteur: "LF", unite: "IMAZA", emplacement: "RDC" },
  { secteur: "NISSAN", unite: "LA", emplacement: "Bassin digesteur" },
  { secteur: "NISSAN", unite: "LA", emplacement: "Étage filtre" },
  { secteur: "NISSAN", unite: "LA", emplacement: "RDC" },
  { secteur: "NISSAN", unite: "LB", emplacement: "Bassin digesteur" },
  { secteur: "NISSAN", unite: "LB", emplacement: "Étage filtre" },
  { secteur: "NISSAN", unite: "LB", emplacement: "Sous filtre" },
  { secteur: "NISSAN", unite: "LB", emplacement: "RDC" },
  { secteur: "NISSAN", unite: "LD", emplacement: "Bassin digesteur" },
  { secteur: "NISSAN", unite: "LD", emplacement: "Étage filtre" },
  { secteur: "NISSAN", unite: "LD", emplacement: "Sous filtre" },
  { secteur: "NISSAN", unite: "LD", emplacement: "RDC" },
  { secteur: "ST", unite: "U33", emplacement: "RDC" },
  { secteur: "ST", unite: "U04", emplacement: "RDC" },
];
