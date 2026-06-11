const User    = require("../models/User");
const Card    = require("../models/Card");
const Student = require("../models/Student");
const Alert   = require("../models/Alert");

const getStats = async (req, res) => {
  try {
    const [users, cards, students, alertCount] = await Promise.all([
      User.find().select("role status"),
      Card.find().select("status"),
      Student.find().select("status"),
      Alert.countDocuments(),
    ]);

    const count = (arr, field, val) => arr.filter(x => x[field] === val).length;

    return res.status(200).json({
      stats: {
        users: {
          total:                users.length,
          admins:               count(users, "role", "admin"),
          security_agents:      count(users, "role", "security_agent"),
          payment_agents:       count(users, "role", "payment_agent"),
          librarians:           count(users, "role", "librarian"),
          service_scolarite:    count(users, "role", "service_scolarite"),
          charge_cantine:       count(users, "role", "charge_cantine"),
          charge_imprimerie:    count(users, "role", "charge_imprimerie"),
          students:             count(users, "role", "student"),
          active:               count(users, "status", "active"),
          blocked:              count(users, "status", "blocked"),
          disabled:             count(users, "status", "disabled"),
        },
        cards: {
          total:   cards.length,
          active:  count(cards, "status", "active"),
          blocked: count(cards, "status", "blocked"),
          lost:    count(cards, "status", "lost"),
          expired: count(cards, "status", "expired"),
        },
        aiAlerts:     { total: alertCount },
        system: {
          status:        "operational",
          uptimeSeconds: Math.floor(process.uptime()),
        },
      },
    });
  } catch (error) {
    console.error("Erreur getStats :", error);
    return res.status(500).json({ message: "Erreur lors de la récupération des statistiques." });
  }
};

module.exports = { getStats };
