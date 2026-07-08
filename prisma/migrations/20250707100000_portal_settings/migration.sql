-- CreateTable
CREATE TABLE "PortalSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PortalSetting_pkey" PRIMARY KEY ("key")
);
