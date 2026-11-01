package com.lhs.share.hub.repository

import com.lhs.share.hub.repository.entity.BetaCampaign
import com.lhs.share.hub.repository.entity.BetaEnrollment
import com.lhs.share.hub.repository.entity.BetaSnapshotEntry
import org.springframework.data.mongodb.repository.MongoRepository

interface BetaCampaignRepository : MongoRepository<BetaCampaign, String>
interface BetaEnrollmentRepository : MongoRepository<BetaEnrollment, String>
interface BetaSnapshotEntryRepository : MongoRepository<BetaSnapshotEntry, String>
