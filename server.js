const express = require("express");
const axios = require("axios");
const nodemailer = require("nodemailer");
const path = require("path");
require("dotenv").config();

const app = express();
app.use(express.json());

let leads = [];

function extractEmails(text) {
  const emails = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
  return emails ? [...new Set(emails)] : [];
}

async function searchGoogle(query) {
  try {
    const response = await axios.get("https://serpapi.com/search.json", {
      params: {
        engine: "google",
        q: query,
        api_key: process.env.SERPAPI_KEY,
        num: 5
      }
    });

    const results = response.data.organic_results || [];

    return results
      .map(item => item.link)
      .filter(link =>
        link &&
        link.startsWith("http") &&
        !link.includes("facebook.com") &&
        !link.includes("instagram.com") &&
        !link.includes("linkedin.com") &&
        !link.includes("youtube.com") &&
        !link.includes("pinterest.com")
      )
      .slice(0, 5);
  } catch (error) {
    console.log("Search error:", error.message);
    return [];
  }
}

async function scrapeEmails(url) {
  try {
    const { data } = await axios.get(url, {
      timeout: 5000,
      headers: {
        "User-Agent": "Mozilla/5.0"
      }
    });

    return extractEmails(data);
  } catch {
    return [];
  }
}

async function findLeads() {
  const queries = [
    `"singing bowl" "contact" "email"`,
    `"singing bowl" "wholesale" "email"`,
    `"sound healing store" "email"`
  ];

  let foundLeads = [];
  let checkedSites = [];

  for (const query of queries) {
    console.log("Searching:", query);

    const websites = await searchGoogle(query);

    for (const site of websites) {
      if (checkedSites.includes(site)) continue;

      checkedSites.push(site);
      console.log("Checking:", site);

      const emails = await scrapeEmails(site);

      emails.forEach(email => {
        if (
          !email.includes("example") &&
          !email.includes("domain") &&
          !email.includes("your@email.com") &&
          !email.includes("sentry") &&
          !email.includes("wixpress") &&
          !email.includes("shopify") &&
          !email.includes(".png") &&
          !email.includes(".jpg")
        ) {
          foundLeads.push({
            email,
            source: site
          });
        }
      });

      if (foundLeads.length >= 10) break;
    }

    if (foundLeads.length >= 10) break;
  }

  const unique = [];
  const seen = new Set();

  for (const lead of foundLeads) {
    if (!seen.has(lead.email)) {
      seen.add(lead.email);
      unique.push(lead);
    }
  }

  leads = unique;
  return leads;
}

async function sendPresentation() {
  if (leads.length === 0) {
    console.log("No leads found. Email sending skipped.");
    return [];
  }

  const presentationPath = path.join(__dirname, "presentation.pdf");

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD
    }
  });

  const results = [];

  for (const lead of leads.slice(0, 10)) {
    try {
      await transporter.sendMail({
        from: process.env.GMAIL_USER,
        to: lead.email,
        subject: "Singing Bowl Product Presentation",
        text: "Hello, please find attached our singing bowl product presentation.",
        attachments: [
          {
            filename: "presentation.pdf",
            path: presentationPath
          }
        ]
      });

      console.log("Sent to:", lead.email);

      results.push({
        email: lead.email,
        status: "sent"
      });

      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      console.log("Failed:", lead.email, error.message);

      results.push({
        email: lead.email,
        status: "failed",
        error: error.message
      });
    }
  }

  return results;
}

async function runAutomation() {
  console.log("Automation started...");

  await findLeads();

  console.log("Total leads found:", leads.length);
  console.log(leads);

  const results = await sendPresentation();

  console.log("Automation completed.");
  console.log(results);
}

app.get("/", (req, res) => {
  res.send("Singing Bowl Lead API is running");
});

app.get("/find-leads", async (req, res) => {
  const found = await findLeads();

  res.json({
    platform: "Google using SerpAPI",
    total: found.length,
    leads: found
  });
});

app.get("/leads", (req, res) => {
  res.json({
    total: leads.length,
    leads
  });
});

app.get("/run-automation", async (req, res) => {
  await runAutomation();

  res.json({
    message: "Automation completed",
    totalLeads: leads.length,
    leads
  });
});

app.listen(process.env.PORT, () => {
  console.log(`API running at http://localhost:${process.env.PORT}`);

  setTimeout(() => {
    runAutomation();
  }, 5000);
});