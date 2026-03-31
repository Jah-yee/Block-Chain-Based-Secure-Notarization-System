const Joi = require('joi');

// Schema for creating a document (Metadata only, hash is server-side authoritative)
const documentCreateSchema = Joi.object({
  name: Joi.string().required().messages({
    'any.required': 'File name is required',
    'string.empty': 'File name cannot be empty'
  }),
  type: Joi.string().required().messages({
    'any.required': 'File type is required',
    'string.empty': 'File type cannot be empty'
  }),
  owner: Joi.number().integer().positive().optional().messages({
    'number.base': 'Owner must be a number',
    'number.integer': 'Owner must be an integer',
    'number.positive': 'Owner must be positive'
  })
});

// Schema for updating a document (PATCH)
const documentUpdateSchema = Joi.object({
  name: Joi.string().optional().messages({
    'string.empty': 'File name cannot be empty'
  }),
  type: Joi.string().optional().messages({
    'string.empty': 'File type cannot be empty'
  }),
  // Note: hash and owner are restricted from updates
  // Other fields like status, notary_id are handled separately
}).min(1).messages({
  'object.min': 'At least one field must be provided for update'
});

module.exports = {
  documentCreateSchema,
  documentUpdateSchema
};
