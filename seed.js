require("dotenv").config();
const connectDB = require("./config/db");
const Staff = require("./models/Staff");
const Property = require("./models/Property");
const Tenant = require("./models/Tenant");
const Billing = require("./models/Billing");
const Maintenance = require("./models/Maintenance");

async function seed() {
  await connectDB();

  await Promise.all([
    Staff.deleteMany({}),
    Property.deleteMany({}),
    Tenant.deleteMany({}),
    Billing.deleteMany({}),
    Maintenance.deleteMany({}),
  ]);

  const staff = await Staff.insertMany([
    { name: "Wanjiru Kamau", role: "admin", phone: "0711 000 001", email: "wanjiru@pms.co.ke", pin: "123456" },
    { name: "Brian Otieno", role: "agent", phone: "0711 000 002", assignedAreas: ["Kilimani", "Lavington"], pin: "222222" },
    { name: "Faith Mwikali", role: "agent", phone: "0711 000 003", assignedAreas: ["Ruaka", "Kasarani"], pin: "333333" },
    { name: "Diana Chebet", role: "frontdesk", phone: "0711 000 004", pin: "444444" },
  ]);

  const properties = await Property.insertMany([
    {
      name: "Riverbank Court - A3",
      category: "one-bedroom",
      description: "Bright one-bedroom unit on the 3rd floor, tiled throughout, with a small balcony overlooking the river.",
      area: "Kilimani, Nairobi",
      address: "Riverbank Court, Argwings Kodhek Rd",
      monthlyRent: 32000,
      deposit: 32000,
      status: "occupied",
      bedrooms: 1,
      bathrooms: 1,
      sizeSqm: 45,
      amenities: ["Borehole water", "CCTV", "Backup generator"],
    },
    {
      name: "Riverbank Court - B1",
      category: "bedsitter",
      description: "Compact, well-lit bedsitter, ideal for a single professional. Newly repainted.",
      area: "Kilimani, Nairobi",
      address: "Riverbank Court, Argwings Kodhek Rd",
      monthlyRent: 18000,
      deposit: 18000,
      status: "vacant",
      bedrooms: 0,
      bathrooms: 1,
      sizeSqm: 24,
      amenities: ["Borehole water", "CCTV"],
    },
    {
      name: "Greenwood Apartments - 2B",
      category: "two-bedroom",
      description: "Two-bedroom apartment with a dedicated parking bay and a fitted kitchen.",
      area: "Lavington, Nairobi",
      address: "Greenwood Apartments, James Gichuru Rd",
      monthlyRent: 55000,
      deposit: 55000,
      status: "maintenance",
      bedrooms: 2,
      bathrooms: 2,
      sizeSqm: 78,
      amenities: ["Parking", "Gym access", "Backup generator"],
    },
    {
      name: "Sunset Villas - Executive 4",
      category: "executive-bedsitter",
      description: "Executive bedsitter with a walk-in closet and a private entrance, finished to a high standard.",
      area: "Ruaka, Kiambu",
      address: "Sunset Villas, Ruaka-Banana Rd",
      monthlyRent: 24000,
      deposit: 24000,
      status: "vacant",
      bedrooms: 0,
      bathrooms: 1,
      sizeSqm: 30,
      amenities: ["Borehole water", "Elevator"],
    },
    {
      name: "Sunset Villas - 3B",
      category: "three-bedroom",
      description: "Spacious family unit with a servant quarter and a private balcony.",
      area: "Ruaka, Kiambu",
      address: "Sunset Villas, Ruaka-Banana Rd",
      monthlyRent: 65000,
      deposit: 65000,
      status: "occupied",
      bedrooms: 3,
      bathrooms: 2,
      sizeSqm: 110,
      amenities: ["Parking", "SQ", "Backup generator", "Elevator"],
    },
    {
      name: "Northgate Heights - 4A",
      category: "single-room",
      description: "Simple single room, shared bathroom on the floor, close to the matatu stage.",
      area: "Kasarani, Nairobi",
      address: "Northgate Heights, Mwiki Rd",
      monthlyRent: 9000,
      deposit: 9000,
      status: "vacant",
      bedrooms: 0,
      bathrooms: 1,
      sizeSqm: 15,
      amenities: [],
    },
  ]);

  const [riverA3, , , , sunset3B] = properties;

  const tenants = await Tenant.insertMany([
    {
      fullName: "James Mwangi",
      phone: "0722 111 222",
      email: "james.mwangi@example.com",
      idNumber: "29881122",
      occupation: "Software Engineer",
      emergencyContactName: "Susan Mwangi",
      emergencyContactPhone: "0733 222 111",
      occupants: 1,
      property: riverA3._id,
      moveInDate: new Date("2025-09-01"),
      status: "active",
      history: [
        {
          property: riverA3._id,
          propertyName: riverA3.name,
          startDate: new Date("2025-09-01"),
          monthlyRentAtTime: riverA3.monthlyRent,
        },
      ],
      comments: [{ text: "Pays consistently on the 1st of every month.", authorName: "Diana Chebet", authorRole: "frontdesk" }],
    },
    {
      fullName: "Grace Njeri",
      phone: "0722 333 444",
      email: "grace.njeri@example.com",
      idNumber: "30112233",
      occupation: "Teacher",
      emergencyContactName: "Peter Njeri",
      emergencyContactPhone: "0733 444 333",
      occupants: 3,
      property: sunset3B._id,
      moveInDate: new Date("2024-11-15"),
      status: "active",
      history: [
        {
          property: sunset3B._id,
          propertyName: sunset3B.name,
          startDate: new Date("2024-11-15"),
          monthlyRentAtTime: sunset3B.monthlyRent,
        },
      ],
    },
  ]);

  await Billing.insertMany([
    {
      tenant: tenants[0]._id,
      property: riverA3._id,
      type: "rent",
      billingPeriod: "2026-07",
      amount: 32000,
      dueDate: new Date("2026-07-05"),
      status: "paid",
      paidAmount: 32000,
      paidDate: new Date("2026-07-02"),
      paymentMethod: "mpesa",
      reference: "QK7X9YABCD",
    },
    {
      tenant: tenants[1]._id,
      property: sunset3B._id,
      type: "rent",
      billingPeriod: "2026-07",
      amount: 65000,
      dueDate: new Date("2026-07-05"),
      status: "overdue",
      paidAmount: 20000,
      paymentMethod: "cash",
    },
  ]);

  await Maintenance.insertMany([
    {
      property: properties[2]._id, // Greenwood 2B
      title: "Kitchen sink leaking",
      description: "Water pooling under the kitchen sink, likely a worn seal on the drain pipe.",
      category: "plumbing",
      priority: "high",
      status: "in-progress",
      reportedBy: "Brian Otieno",
    },
    {
      property: sunset3B._id,
      title: "Backup generator not auto-starting",
      description: "During the last outage the generator needed to be started manually.",
      category: "electrical",
      priority: "medium",
      status: "open",
      reportedBy: "Faith Mwikali",
    },
  ]);

  console.log(`Seeded ${staff.length} staff, ${properties.length} properties, ${tenants.length} tenants.`);
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
