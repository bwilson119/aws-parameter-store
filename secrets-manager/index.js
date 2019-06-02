const { map, merge, splitEvery, flatten, not, isNil } = require('ramda')

const previous = async ({ aws, parameters, region }) => {
  const secretsManager = new aws.SecretsManager({ region })
  const secretValues = await Promise.all(
    map(async (parameter) => {
      try {
        const [
          secretValueResponse,
          describeSecretResponse,
          resourcePolicyResponse
        ] = await Promise.all([
          secretsManager.getSecretValue({ SecretId: parameter.name }).promise(),
          secretsManager.describeSecret({ SecretId: parameter.name }).promise(),
          secretsManager.getResourcePolicy({ SecretId: parameter.name }).promise()
        ])
        const value = secretValueResponse.SecretString || secretValueResponse.SecretBinary
        return {
          name: secretValueResponse.Name,
          value,
          type: parameter.type,
          version: secretValueResponse.VersionId,
          arn: secretValueResponse.ARN,
          kmsKey: describeSecretResponse.KmsKeyId,
          resourcePolicy: resourcePolicyResponse.ResourcePolicy
        }
      } catch (error) {}
    }, parameters)
  )
  return secretValues
}

const deploy = async ({ aws, parameters, region }) => {
  const secretsManager = new aws.SecretsManager({ region })
  return Promise.all(
    map(async (parameter) => {
      let response
      if (not(parameter.update)) {
        response = await secretsManager
          .createSecret({
            Name: parameter.name,
            [parameter.AWSType]: parameter.value,
            KmsKeyId: parameter.kmsKey
          })
          .promise()
      } else {
        response = await secretsManager
          .updateSecret({
            SecretId: parameter.name,
            [parameter.AWSType]: parameter.value,
            KmsKeyId: parameter.kmsKey
          })
          .promise()
      }
      if (not(isNil(parameter.resourcePolicy))) {
        await secretsManager
          .putResourcePolicy({
            SecretId: parameter.name,
            ResourcePolicy: JSON.stringify(parameter.resourcePolicy)
          })
          .promise()
      } else {
        await secretsManager.deleteResourcePolicy({ SecretId: parameter.name }).promise()
      }
      return {
        name: parameter.name,
        value: parameter.value,
        arn: response.ARN,
        version: response.VersionId,
        kmsKey: parameter.kmsKey
      }
    }, parameters)
  )
}

const remove = async ({ aws, parameters, region }) => {
  const secretsManager = new aws.SecretsManager({ region })
  await Promise.all(
    map(
      async (parameter) =>
        secretsManager
          .deleteSecret({
            SecretId: parameter.name,
            ForceDeleteWithoutRecovery: true // dev
          })
          .promise(),
      parameters
    )
  )
}

module.exports = {
  previous,
  deploy,
  remove
}
