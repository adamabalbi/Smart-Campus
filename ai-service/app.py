"""
Service IA — Détection de paiements suspects (Smart Campus)
Charge le pipeline Random Forest (.joblib) et expose une API de prédiction.
"""
import os
import joblib
import pandas as pd
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

# Chemin du modèle (à la racine du projet, un niveau au-dessus de ce dossier)
MODEL_PATH = os.environ.get(
    "MODEL_PATH",
    os.path.join(os.path.dirname(__file__), "..", "smart_campus_random_forest_model.joblib"),
)

# Colonnes attendues par le pipeline, dans l'ordre d'entraînement
FEATURES = [
    "operation_type",
    "amount",
    "hour",
    "card_status",
    "balance_before",
    "service_type",
    "recent_operations_count",
    "failed_attempts_count",
    "is_authorized_service",
]

model = None


def load_model():
    global model
    try:
        model = joblib.load(MODEL_PATH)
        print(f"✅ Modèle chargé : {MODEL_PATH}")
    except Exception as e:
        print(f"❌ Impossible de charger le modèle : {e}")
        model = None


@app.get("/health")
def health():
    return jsonify({"status": "ok", "model_loaded": model is not None})


@app.post("/predict")
def predict():
    if model is None:
        return jsonify({"error": "Modèle non chargé"}), 503

    data = request.get_json(silent=True) or {}

    # Construire une ligne avec toutes les features attendues
    try:
        row = {
            "operation_type": data.get("operation_type", "payment"),
            "amount": float(data.get("amount", 0)),
            "hour": int(data.get("hour", 0)),
            "card_status": data.get("card_status", "active"),
            "balance_before": float(data.get("balance_before", 0)),
            "service_type": data.get("service_type", "unknown"),
            "recent_operations_count": int(data.get("recent_operations_count", 0)),
            "failed_attempts_count": int(data.get("failed_attempts_count", 0)),
            "is_authorized_service": int(data.get("is_authorized_service", 1)),
        }
        X = pd.DataFrame([row], columns=FEATURES)

        label = int(model.predict(X)[0])
        # Probabilité que le paiement soit suspect (classe 1)
        try:
            score = float(model.predict_proba(X)[0][1])
        except Exception:
            score = None

        return jsonify({
            "label": label,
            "decision": "suspect" if label == 1 else "normal",
            "score": score,
        })
    except Exception as e:
        return jsonify({"error": f"Erreur de prédiction : {e}"}), 400


if __name__ == "__main__":
    load_model()
    port = int(os.environ.get("AI_PORT", 5001))
    print(f"🤖 Service IA démarré sur http://localhost:{port}")
    app.run(host="0.0.0.0", port=port)
