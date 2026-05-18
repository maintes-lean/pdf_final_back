import pool from "../config/db.js";
import * as ItineraryModel from "../models/itinerary.model.js";

/* =========================================
GET ITINERARIES BY VIAJE
Devuelve una lista para permitir múltiples itinerarios por viaje.
========================================= */
export const getItineraryByViaje = async (req, res) => {
  try {
    const userId = req.user.id;
    const { viajeId } = req.params;

    const itineraries = await ItineraryModel.getByViaje(viajeId, userId);

    res.json(Array.isArray(itineraries) ? itineraries : []);
  } catch (err) {
    console.error("GET ITINERARIES ERROR:", err);
    res.status(500).json({ error: "Error obteniendo itinerarios" });
  }
};

/* =========================================
GET ITINERARY BY ID
========================================= */
export const getItineraryById = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const itinerary = await ItineraryModel.getById(id, userId);

    if (!itinerary) {
      return res.status(404).json({ error: "Itinerario no encontrado" });
    }

    res.json(itinerary);
  } catch (err) {
    console.error("GET ITINERARY BY ID ERROR:", err);
    res.status(500).json({ error: "Error obteniendo itinerario" });
  }
};

/* =========================================
CREATE ITINERARY
Siempre crea un nuevo registro. Ya no hace upsert por viaje.
========================================= */
export const saveItinerary = async (req, res) => {
  const conn = await pool.getConnection();

  try {
    const userId = req.user.id;

    const {
      viaje_id,
      version,
      issue_date,
      notes,
      auto_generated,
      pdf_name,
      pdf_path
    } = req.body || {};

    if (!viaje_id) {
      return res.status(400).json({ error: "viaje_id requerido" });
    }

    await conn.beginTransaction();

    const id = await ItineraryModel.createItinerary(
      conn,
      {
        viaje_id,
        version,
        issue_date,
        notes,
        auto_generated,
        pdf_name,
        pdf_path,
        created_by: userId
      }
    );

    await conn.commit();

    const saved = await ItineraryModel.getById(id, userId);

    res.status(201).json(saved);
  } catch (err) {
    await conn.rollback();
    console.error("SAVE ITINERARY ERROR:", err);
    res.status(400).json({ error: err.message || "Error guardando itinerario" });
  } finally {
    conn.release();
  }
};

/* =========================================
UPDATE ITINERARY BY ID
========================================= */
export const updateItinerary = async (req, res) => {
  const conn = await pool.getConnection();

  try {
    const userId = req.user.id;
    const { id } = req.params;

    const exists = await ItineraryModel.getById(id, userId);

    if (!exists) {
      return res.status(404).json({ error: "Itinerario no encontrado" });
    }

    await conn.beginTransaction();

    await ItineraryModel.updateItinerary(
      conn,
      id,
      req.body,
      userId
    );

    await conn.commit();

    const updated = await ItineraryModel.getById(id, userId);

    res.json(updated);
  } catch (err) {
    await conn.rollback();
    console.error("UPDATE ITINERARY ERROR:", err);
    res.status(400).json({ error: err.message || "Error actualizando itinerario" });
  } finally {
    conn.release();
  }
};

/* =========================================
DELETE ITINERARY
========================================= */
export const deleteItinerary = async (req, res) => {
  const conn = await pool.getConnection();

  try {
    const userId = req.user.id;
    const { id } = req.params;

    const exists = await ItineraryModel.getById(id, userId);

    if (!exists) {
      return res.status(404).json({ error: "Itinerario no encontrado" });
    }

    await conn.beginTransaction();

    await ItineraryModel.deleteItinerary(conn, id, userId);

    await conn.commit();

    res.json({ ok: true });
  } catch (err) {
    await conn.rollback();
    console.error("DELETE ITINERARY ERROR:", err);
    res.status(500).json({ error: "Error eliminando itinerario" });
  } finally {
    conn.release();
  }
};
