// api/sponsors.js — активные партнёры для клиента (только публичные поля). Три закона: буст ≤2.5, всегда помечен, только релевантное.
const { sponsors } = require("./_sponsors.js");
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
  const project = String(req.query.project || "");
  const list = (await sponsors()).filter(s => !project || !s.project || s.project === project);
  return res.status(200).json(list);
};
