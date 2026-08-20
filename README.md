# Pristine

Console personnelle de revente de cartes à collectionner. Photographie une carte,
obtiens sa cote sur le marché français, publie sur Vinted, leboncoin et eBay, et
suis ton **profit net réel** — commissions, port et consommables déduits.

Next.js · Anthropic. Pas de compte, pas de base distante, pas d'abonnement.

## Mise en route

```bash
cp .env.example .env.local     # colle ta clé Anthropic
npm install
npm run dev
```

Deux variables :

- **`APP_PASSWORD`** — le mot de passe qui protège l'application. Choisis-le toi,
  long et unique. Sans lui, l'application reste fermée.
- **`ANTHROPIC_API_KEY`** — à créer sur
  [console.anthropic.com](https://console.anthropic.com) → Settings → API Keys.
  Elle reste côté serveur : aucun préfixe `NEXT_PUBLIC_`, jamais de commit.

Pense à fixer un plafond de dépense mensuel dans la section Billing.

## Mode démo — à lire en premier

L'application démarre en **mode démo**. Les analyses renvoient des données
d'exemple, instantanément et sans le moindre appel d'API facturé. Tout se
teste : le scan, la cote, la rédaction, le centrage, le conseil de gradation,
le scan de lot.

Bascule en **mode réel** dans Réglages seulement quand tu scannes une vraie
carte pour de bon. Un compteur y affiche le nombre d'appels du jour et un ordre
de grandeur de la dépense.

Règle simple : **aucun réglage d'interface ne justifie de passer en réel.**

## Progression

Chaque action rapporte de l'expérience, et les paliers reprennent la hiérarchie
de rareté des cartes — de Commune à Dorée. Douze badges à débloquer, une série
de jours consécutifs, et deux ou trois surprises cachées qu'il vaut mieux
découvrir soi-même. Tout est local, rien n'est envoyé nulle part.

## Le verrou

Toutes les pages **et l'API d'analyse** sont derrière un mot de passe. C'est
l'API qui compte le plus : sans elle protégée, un inconnu tombant sur l'URL
pourrait faire tourner ta facture Anthropic sans jamais voir l'interface.

Le mot de passe n'est jamais stocké côté navigateur. À la connexion, le serveur
dépose un cookie `HttpOnly` contenant un jeton signé valable 30 jours. Changer
`APP_PASSWORD` invalide immédiatement toutes les sessions ouvertes.

Un échec de connexion est ralenti de six dixièmes de seconde, ce qui rend une
attaque par force brute pénible — mais la vraie protection reste la longueur du
mot de passe. Prends-en un généré au hasard, pas un mot du dictionnaire.

## Déploiement

Importe le dépôt sur Vercel, ajoute `ANTHROPIC_API_KEY` dans les variables
d'environnement (coche *Sensitive*), déploie. C'est tout.

Le déploiement est ce qui débloque le **viseur guidé** : `getUserMedia` exige
HTTPS sur ton propre domaine. En local, `localhost` fonctionne aussi.

## Où vivent tes données

Dans IndexedDB, c'est-à-dire **dans ce navigateur, sur cet appareil**. Rien ne
part sur un serveur, sauf les photos envoyées à l'API le temps d'une analyse.

Conséquence directe : vider les données de navigation efface ton stock, et ton
téléphone et ton ordinateur ont chacun leur propre stock. **Exporte
régulièrement** depuis Réglages — le fichier JSON est ta seule sauvegarde, et
c'est lui qui permet de passer d'un appareil à l'autre.

## Coût

Chaque analyse est un appel d'API facturé par Anthropic. Compte environ 5 c€
pour scanner une carte de bout en bout, dont l'essentiel part dans la recherche
de cote — c'est elle qui déclenche une recherche web. Le rafraîchissement
automatique à l'ouverture est le poste le plus lourd : réduis-le ou coupe-le
dans Réglages si la facture grimpe.

## Limites assumées

- **Vinted et leboncoin n'ont pas d'API publique.** Le retrait d'une annonce
  vendue ailleurs reste manuel ; l'app te dit quoi retirer et où, avec le lien.
- **La cote dépend de sources tierces.** Cardmarket, PokeValue, Upcards et les
  ventes eBay France sont interrogés par recherche web. Chaque source est
  affichée avec son prix et son lien : vérifie avant de fixer un prix.
- **La fourchette de note n'est pas une gradation.** Le centrage est mesurable
  depuis une photo cadrée, la surface ne l'est pas. C'est un outil de décision,
  jamais un engagement vis-à-vis d'un acheteur.

Pristine n'est affilié ni à Nintendo, ni à The Pokémon Company, ni à Vinted,
leboncoin, eBay, PSA ou PCA.
